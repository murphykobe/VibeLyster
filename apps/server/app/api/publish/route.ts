import { NextRequest } from "next/server";
import { requireAuth, AuthError, authErrorResponse } from "@/lib/auth";
import { getListingById, getConnection, upsertPlatformListing, updatePlatformListingStatus } from "@/lib/db";
import { decryptTokens } from "@/lib/crypto";
import { publishToGrailed } from "@/lib/marketplace/grailed";
import { publishToDepop } from "@/lib/marketplace/depop";
import { publishToEbay } from "@/lib/marketplace/ebay-publish";
import { fetchEbaySellerReadiness } from "@/lib/marketplace/ebay-seller";
import { buildEbayListingMetadata } from "@/lib/marketplace/ebay-metadata";
import { generateEbayAspects } from "@/lib/ai";
import { PublishBody, parseBody } from "@/lib/validation";
import type {
  GrailedTokens,
  DepopTokens,
  EbayListingMetadata,
  EbaySellerReadiness,
  EbayTokens,
  Platform,
  CanonicalListing,
  PublishMode,
} from "@/lib/marketplace/types";
import { isMockMode, mockPlatformListingId } from "@/lib/mock";

const RETRY_DELAY_MS = 2000;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function publishWithRetry(
  listing: CanonicalListing,
  platform: Platform,
  tokens: Record<string, unknown>,
  options: {
    mode: PublishMode;
    existingPlatformListingId?: string | null;
    existingPlatformData?: Record<string, unknown> | null;
    ebayMetadata?: EbayListingMetadata;
    ebaySellerReadiness?: EbaySellerReadiness;
  }
) {
  let attempts = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    attempts = attempt;
    const result = platform === "grailed"
      ? await publishToGrailed(listing, tokens as GrailedTokens, options)
      : platform === "depop"
        ? await publishToDepop(listing, tokens as DepopTokens, options)
        : await publishToEbay(listing, tokens as EbayTokens, {
            ...options,
            metadata: options.ebayMetadata ?? {},
            sellerReadiness: options.ebaySellerReadiness ?? {
              ready: false,
              missing: ["seller_readiness"],
              policies: {},
              checkedAt: new Date().toISOString(),
            },
          });

    if (result.ok || !result.retryable || attempt === 2) return { result, attempts };
    await sleep(RETRY_DELAY_MS);
  }
  return { result: { ok: false as const, error: "Publish failed after retries", retryable: false }, attempts };
}

/**
 * POST /api/publish
 * Body: { listingId: string, platforms: string[], mode?: "live" | "draft" }
 * Publishes a listing to one or more platforms synchronously.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const parsed = parseBody(PublishBody, await req.json());
    if ("error" in parsed) return parsed.error;
    const { listingId, platforms, mode } = parsed.data;

    const dbListing = await getListingById(user.id, listingId);
    if (!dbListing) return Response.json({ error: "Listing not found" }, { status: 404 });

    const canonical: CanonicalListing = {
      id: dbListing.id,
      title: dbListing.title,
      description: dbListing.description,
      price: Number(dbListing.price),
      size: dbListing.size,
      condition: dbListing.condition,
      brand: dbListing.brand,
      category: dbListing.category,
      traits: (dbListing.traits as Record<string, string>) ?? {},
      photos: (dbListing.photos as string[]) ?? [],
    };

    const results: Record<string, unknown> = {};

    for (const platform of platforms as Platform[]) {
      const conn = await getConnection(user.id, platform);
      const existingPlatformListing = (dbListing.platform_listings ?? []).find((pl) => pl.platform === platform);
      if (!conn) {
        results[platform] = { ok: false, error: `Not connected to ${platform}` };
        continue;
      }

      // Mark as publishing (attempt_count stays at current value; incremented per actual attempt below)
      await upsertPlatformListing(listingId, platform, { status: "publishing" });

      if (isMockMode()) {
        const platformListingId = existingPlatformListing?.platform_listing_id ?? mockPlatformListingId(platform, mode);
        const platformData = {
          ...(existingPlatformListing?.platform_data ?? {}),
          remote_state: mode,
          mode_requested: mode,
          mode_used: mode,
        };
        await updatePlatformListingStatus(listingId, platform, mode === "draft" ? "pending" : "live", {
          platformListingId,
          incrementAttempt: true,
          platformData,
        });
        results[platform] = { ok: true, platformListingId, modeRequested: mode, modeUsed: mode, remoteState: mode, mock: true };
        continue;
      }

      const tokens = decryptTokens(conn.encrypted_tokens);
      const ebaySellerReadiness = platform === "ebay"
        ? await fetchEbaySellerReadiness({ accessToken: (tokens as EbayTokens).access_token })
        : undefined;
      const ebayMetadata = platform === "ebay"
        ? (await buildEbayListingMetadata({
            listing: canonical,
            existing: existingPlatformListing?.platform_data as EbayListingMetadata | undefined,
            generateFallback: ({ listing, missingAspects }) =>
              generateEbayAspects({
                listing: {
                  title: listing.title,
                  description: listing.description,
                  brand: listing.brand,
                  size: listing.size,
                  category: listing.category,
                  traits: listing.traits,
                },
                missingAspects,
              }),
          })).metadata
        : undefined;

      const startMs = Date.now();
      const { result, attempts } = await publishWithRetry(canonical, platform, tokens, {
        mode,
        existingPlatformListingId: existingPlatformListing?.platform_listing_id,
        existingPlatformData: existingPlatformListing?.platform_data ?? null,
        ebayMetadata,
        ebaySellerReadiness,
      });
      const latencyMs = Date.now() - startMs;

      console.log(JSON.stringify({
        event: result.ok ? "publish.success" : "publish.failure",
        platform,
        latency_ms: latencyMs,
        listing_id: listingId,
        attempts,
        error: result.ok ? undefined : result.error,
      }));

      if (result.ok) {
        const nextStatus = result.remoteState === "draft" ? "pending" : "live";
        await updatePlatformListingStatus(listingId, platform, nextStatus, {
          platformListingId: result.platformListingId,
          incrementAttempt: true,
          platformData: {
            ...result.platformData,
            remote_state: result.remoteState,
            mode_requested: mode,
            mode_used: result.modeUsed,
          },
        });
        results[platform] = {
          ok: true,
          platformListingId: result.platformListingId,
          modeRequested: mode,
          modeUsed: result.modeUsed,
          remoteState: result.remoteState,
        };
      } else {
        await updatePlatformListingStatus(listingId, platform, "failed", {
          lastError: result.error,
          incrementAttempt: true,
        });
        results[platform] = { ok: false, error: result.error };
      }
    }

    return Response.json({ results });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("POST /api/publish", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
