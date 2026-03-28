import { NextRequest } from "next/server";
import { requireAuth, AuthError, authErrorResponse } from "@/lib/auth";
import { getListingById, getConnection, upsertPlatformListing, updatePlatformListingStatus } from "@/lib/db";
import { decryptTokens } from "@/lib/crypto";
import { publishToGrailed } from "@/lib/marketplace/grailed";
import { publishToDepop } from "@/lib/marketplace/depop";
import { PublishBody, parseBody } from "@/lib/validation";
import type { GrailedTokens, DepopTokens, Platform, CanonicalListing } from "@/lib/marketplace/types";

const RETRY_DELAY_MS = 2000;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function publishWithRetry(
  listing: CanonicalListing,
  platform: Platform,
  tokens: Record<string, unknown>
) {
  if (platform !== "grailed" && platform !== "depop") {
    return { result: { ok: false as const, error: "eBay not yet supported", retryable: false }, attempts: 0 };
  }

  let attempts = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    attempts = attempt;
    const result = platform === "grailed"
      ? await publishToGrailed(listing, tokens as GrailedTokens)
      : await publishToDepop(listing, tokens as DepopTokens);

    if (result.ok || !result.retryable || attempt === 2) return { result, attempts };
    await sleep(RETRY_DELAY_MS);
  }
  return { result: { ok: false as const, error: "Publish failed after retries", retryable: false }, attempts };
}

/**
 * POST /api/publish
 * Body: { listingId: string, platforms: string[] }
 * Publishes a listing to one or more platforms synchronously.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const parsed = parseBody(PublishBody, await req.json());
    if ("error" in parsed) return parsed.error;
    const { listingId, platforms } = parsed.data;

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
      if (!conn) {
        results[platform] = { ok: false, error: `Not connected to ${platform}` };
        continue;
      }

      const tokens = decryptTokens(conn.encrypted_tokens);

      // Mark as publishing (attempt_count stays at current value; incremented per actual attempt below)
      await upsertPlatformListing(listingId, platform, { status: "publishing" });

      const startMs = Date.now();
      const { result, attempts } = await publishWithRetry(canonical, platform, tokens);
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
        await updatePlatformListingStatus(listingId, platform, "live", {
          platformListingId: result.platformListingId,
          incrementAttempt: true,
        });
        results[platform] = { ok: true, platformListingId: result.platformListingId };
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
