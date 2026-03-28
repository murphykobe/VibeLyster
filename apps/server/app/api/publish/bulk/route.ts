import { NextRequest, after } from "next/server";
import { requireAuth, AuthError, authErrorResponse } from "@/lib/auth";
import { getListingById, getConnection, upsertPlatformListing, updatePlatformListingStatus } from "@/lib/db";
import { decryptTokens } from "@/lib/crypto";
import { publishToGrailed } from "@/lib/marketplace/grailed";
import { publishToDepop } from "@/lib/marketplace/depop";
import type { GrailedTokens, DepopTokens, Platform, CanonicalListing } from "@/lib/marketplace/types";

const RATE_LIMIT_DELAY_MS = 2000; // 1 publish per platform per 2 seconds

/**
 * POST /api/publish/bulk
 * Body: { listingIds: string[], platforms: string[] }
 * Marks all as 'publishing' and processes asynchronously.
 * Mobile app polls /api/listings to see updated statuses.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { listingIds, platforms } = await req.json() as { listingIds: string[]; platforms: string[] };

    if (!Array.isArray(listingIds) || listingIds.length === 0) {
      return Response.json({ error: "listingIds[] is required" }, { status: 400 });
    }
    if (!Array.isArray(platforms) || platforms.length === 0) {
      return Response.json({ error: "platforms[] is required" }, { status: 400 });
    }

    // Verify all listings belong to user and mark as publishing
    for (const listingId of listingIds) {
      const dbListing = await getListingById(user.id, listingId);
      if (!dbListing) continue;
      for (const platform of platforms as Platform[]) {
        await upsertPlatformListing(listingId, platform, { status: "publishing" });
      }
    }

    // Use Next.js `after()` to extend the serverless function lifecycle past the response.
    // This guarantees the background work runs even after the response is sent.
    // Requires Next.js 15+ and `experimental.after: true` in next.config.ts.
    after(processInBackground(user.id, listingIds, platforms as Platform[]));

    return Response.json({ acknowledged: true, count: listingIds.length });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("POST /api/publish/bulk", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function processInBackground(userId: string, listingIds: string[], platforms: Platform[]) {
  // Fetch tokens once per platform
  const tokenMap: Partial<Record<Platform, Record<string, unknown>>> = {};
  for (const platform of platforms) {
    const conn = await getConnection(userId, platform).catch(() => null);
    if (conn) tokenMap[platform] = decryptTokens(conn.encrypted_tokens);
  }

  for (const listingId of listingIds) {
    const dbListing = await getListingById(userId, listingId).catch(() => null);
    if (!dbListing) continue;

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

    // Publish to each platform sequentially per listing (parallel across platforms per spec)
    await Promise.all(
      platforms.map(async (platform) => {
        const tokens = tokenMap[platform];
        if (!tokens) {
          await updatePlatformListingStatus(listingId, platform, "failed", {
            lastError: `Not connected to ${platform}`,
          });
          return;
        }

        let result;
        try {
          if (platform === "grailed") {
            result = await publishToGrailed(canonical, tokens as GrailedTokens);
          } else if (platform === "depop") {
            result = await publishToDepop(canonical, tokens as DepopTokens);
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
          await updatePlatformListingStatus(listingId, platform, "live", {
            platformListingId: result.platformListingId,
          });
        } else {
          await updatePlatformListingStatus(listingId, platform, "failed", {
            lastError: result.error,
            incrementAttempt: true,
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
