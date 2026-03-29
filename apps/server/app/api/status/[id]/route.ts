import { NextRequest } from "next/server";
import { requireAuth, AuthError, authErrorResponse } from "@/lib/auth";
import { getListingById, getConnection, updatePlatformListingStatus } from "@/lib/db";
import { decryptTokens } from "@/lib/crypto";
import { checkGrailedStatus } from "@/lib/marketplace/grailed";
import { checkDepopStatus } from "@/lib/marketplace/depop";
import type { DepopTokens, Platform } from "@/lib/marketplace/types";
import { isMockMode, mockPlatformListingId } from "@/lib/mock";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/status/:id
 * Fires live status checks against marketplace APIs for a specific listing.
 * Updates DB with fresh status. Returns per-platform statuses.
 */
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id: listingId } = await params;

    const dbListing = await getListingById(user.id, listingId);
    if (!dbListing) return Response.json({ error: "Listing not found" }, { status: 404 });

    const mockMode = isMockMode();
    const platformListings = dbListing.platform_listings ?? [];
    const statusResults: Record<string, unknown> = {};

    for (const pl of platformListings) {
      const allowPublishingWithoutId = mockMode && pl.status === "publishing";
      const platformListingId = pl.platform_listing_id;

      if ((!platformListingId && !allowPublishingWithoutId) || pl.status === "delisted" || pl.status === "pending") {
        statusResults[pl.platform] = { status: pl.status, synced: false };
        continue;
      }

      if (mockMode) {
        if (pl.status === "publishing") {
          const resolvedPlatformListingId = platformListingId ?? mockPlatformListingId(pl.platform);
          await updatePlatformListingStatus(listingId, pl.platform as Platform, "live", { platformListingId: resolvedPlatformListingId });
          statusResults[pl.platform] = { status: "live", synced: true, mock: true };
        } else {
          statusResults[pl.platform] = { status: pl.status, synced: true, mock: true };
        }
        continue;
      }

      if (!platformListingId) {
        statusResults[pl.platform] = { status: pl.status, synced: false };
        continue;
      }

      const conn = await getConnection(user.id, pl.platform);
      if (!conn) {
        statusResults[pl.platform] = { status: pl.status, synced: false, reason: "not_connected" };
        continue;
      }

      const tokens = decryptTokens(conn.encrypted_tokens);

      let result;
      if (pl.platform === "grailed") {
        result = await checkGrailedStatus(platformListingId);
      } else if (pl.platform === "depop") {
        result = await checkDepopStatus(platformListingId, tokens as DepopTokens);
      } else {
        statusResults[pl.platform] = { status: pl.status, synced: false };
        continue;
      }

      if (result.ok && result.status !== "unknown") {
        const mappedStatus = result.status === "live" ? "live"
          : result.status === "sold" ? "sold"
          : "delisted";
        await updatePlatformListingStatus(listingId, pl.platform as Platform, mappedStatus);
        statusResults[pl.platform] = { status: mappedStatus, synced: true };
      } else {
        statusResults[pl.platform] = { status: pl.status, synced: false, error: result.ok ? undefined : result.error };
      }
    }

    return Response.json({ listingId, statuses: statusResults, checkedAt: new Date().toISOString() });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("GET /api/status/[id]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
