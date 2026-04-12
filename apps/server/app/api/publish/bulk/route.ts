import { NextRequest, after } from "next/server";
import { requireAuth, AuthError, authErrorResponse } from "@/lib/auth";
import { getListingById, getConnection, upsertPlatformListing, updatePlatformListingStatus } from "@/lib/db";
import { decryptTokens } from "@/lib/crypto";
import { publishToGrailed } from "@/lib/marketplace/grailed";
import { publishToDepop } from "@/lib/marketplace/depop";
import { BulkPublishBody, parseBody } from "@/lib/validation";
import { getDisplaySizeValue, parseStructuredSize } from "@/lib/sizes";
import type { GrailedTokens, DepopTokens, Platform, CanonicalListing } from "@/lib/marketplace/types";
import { isMockMode, mockPlatformListingId } from "@/lib/mock";

const RATE_LIMIT_DELAY_MS = 2000; // 1 publish per platform per 2 seconds

/**
 * POST /api/publish/bulk
 * Body: { listingIds: string[], platforms: string[], mode?: "live" | "draft" }
 * Marks all as 'publishing' and processes asynchronously.
 * Mobile app polls /api/listings to see updated statuses.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const parsed = parseBody(BulkPublishBody, await req.json());
    if ("error" in parsed) return parsed.error;
    const { listingIds, platforms, mode } = parsed.data;

    // Verify all listings belong to user and mark as publishing
    for (const listingId of listingIds) {
      const dbListing = await getListingById(user.id, listingId);
      if (!dbListing) continue;
      for (const platform of platforms as Platform[]) {
        await upsertPlatformListing(listingId, platform, { status: "publishing" });
      }
    }

    if (isMockMode()) {
      await processMockInBackground(user.id, listingIds, platforms as Platform[], mode);
      return Response.json({ acknowledged: true, count: listingIds.length, mock: true });
    }

    // Use Next.js `after()` to extend the serverless function lifecycle past the response.
    // This guarantees the background work runs even after the response is sent.
    // Requires Next.js 15+ and `experimental.after: true` in next.config.ts.
    after(processInBackground(user.id, listingIds, platforms as Platform[], mode));

    return Response.json({ acknowledged: true, count: listingIds.length });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("POST /api/publish/bulk", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function processInBackground(userId: string, listingIds: string[], platforms: Platform[], mode: "live" | "draft") {
  // Fetch tokens once per platform
  const tokenMap: Partial<Record<Platform, Record<string, unknown>>> = {};
  for (const platform of platforms) {
    const conn = await getConnection(userId, platform).catch(() => null);
    if (conn) tokenMap[platform] = decryptTokens(conn.encrypted_tokens);
  }

  for (const listingId of listingIds) {
    const dbListing = await getListingById(userId, listingId).catch(() => null);
    if (!dbListing) continue;

    const missingListingFields = [
      !dbListing.title?.trim() ? "title" : null,
      !dbListing.description?.trim() ? "description" : null,
      dbListing.price == null || Number.isNaN(Number(dbListing.price)) || Number(dbListing.price) <= 0 ? "price" : null,
    ].filter((value): value is string => Boolean(value));

    if (missingListingFields.length > 0) {
      await Promise.all(
        platforms.map((platform) =>
          updatePlatformListingStatus(listingId, platform, "failed", {
            lastError: `Listing requires verification: ${missingListingFields.join(", ")}`,
          })
        )
      );
      continue;
    }

    const canonical: CanonicalListing = {
      id: dbListing.id,
      title: dbListing.title!,
      description: dbListing.description!,
      price: Number(dbListing.price),
      size: getDisplaySizeValue(dbListing.size),
      structuredSize: parseStructuredSize(dbListing.size),
      condition: dbListing.condition,
      brand: dbListing.brand,
      category: dbListing.category,
      traits: (dbListing.traits as Record<string, string>) ?? {},
      photos: (dbListing.photos as string[]) ?? [],
    };

    // Publish to each platform sequentially per listing (parallel across platforms per spec)
    await Promise.all(
      platforms.map(async (platform) => {
        const tokens = tokenMap[platform];
        const existingPlatformListing = (dbListing.platform_listings ?? []).find((pl) => pl.platform === platform);
        if (!tokens) {
          await updatePlatformListingStatus(listingId, platform, "failed", {
            lastError: `Not connected to ${platform}`,
          });
          return;
        }

        let result;
        try {
          if (platform === "grailed") {
            result = await publishToGrailed(canonical, tokens as GrailedTokens, {
              mode,
              existingPlatformListingId: existingPlatformListing?.platform_listing_id,
              existingPlatformData: existingPlatformListing?.platform_data ?? null,
            });
          } else if (platform === "depop") {
            result = await publishToDepop(canonical, tokens as DepopTokens, {
              mode,
              existingPlatformListingId: existingPlatformListing?.platform_listing_id,
              existingPlatformData: existingPlatformListing?.platform_data ?? null,
            });
          } else {
            result = { ok: false as const, error: "eBay not yet supported", retryable: false };
          }
        } catch (err) {
          result = { ok: false as const, error: String(err), retryable: false };
        }

        console.log(JSON.stringify({
          event: result.ok ? "publish.success" : "publish.failure",
          platform,
          listing_id: listingId,
          bulk: true,
        }));

        if (result.ok) {
          await updatePlatformListingStatus(listingId, platform, result.remoteState === "draft" ? "pending" : "live", {
            platformListingId: result.platformListingId,
            platformData: {
              ...result.platformData,
              remote_state: result.remoteState,
              mode_requested: mode,
              mode_used: result.modeUsed,
            },
          });
        } else {
          await updatePlatformListingStatus(listingId, platform, "failed", {
            platformListingId: result.platformListingId,
            lastError: result.error,
            incrementAttempt: true,
            platformData: result.platformData
              ? {
                  ...(existingPlatformListing?.platform_data ?? {}),
                  ...result.platformData,
                }
              : undefined,
          });
        }
      })
    );

    // Rate limit: 2s between listings to avoid hammering marketplace APIs
    if (listingIds.indexOf(listingId) < listingIds.length - 1) {
      await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
    }
  }
}

async function processMockInBackground(userId: string, listingIds: string[], platforms: Platform[], mode: "live" | "draft") {
  for (const listingId of listingIds) {
    const dbListing = await getListingById(userId, listingId).catch(() => null);
    if (!dbListing) continue;

    await Promise.all(
      platforms.map(async (platform) => {
        const conn = await getConnection(userId, platform).catch(() => null);
        const existingPlatformListing = (dbListing.platform_listings ?? []).find((pl) => pl.platform === platform);
        if (!conn) {
          await updatePlatformListingStatus(listingId, platform, "failed", {
            lastError: `Not connected to ${platform}`,
          });
          return;
        }

        await updatePlatformListingStatus(listingId, platform, mode === "draft" ? "pending" : "live", {
          platformListingId: existingPlatformListing?.platform_listing_id ?? mockPlatformListingId(platform, mode),
          incrementAttempt: true,
          platformData: {
            ...(existingPlatformListing?.platform_data ?? {}),
            remote_state: mode,
            mode_requested: mode,
            mode_used: mode,
          },
        });
      })
    );
  }
}
