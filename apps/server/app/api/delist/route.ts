import { NextRequest } from "next/server";
import { requireAuth, AuthError, authErrorResponse } from "@/lib/auth";
import { getListingById, getConnection, updatePlatformListingStatus } from "@/lib/db";
import { decryptTokens } from "@/lib/crypto";
import { delistFromGrailed } from "@/lib/marketplace/grailed";
import { delistFromDepop } from "@/lib/marketplace/depop";
import type { GrailedTokens, DepopTokens, Platform } from "@/lib/marketplace/types";

/**
 * POST /api/delist
 * Body: { listingId: string, platform: string }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const { listingId, platform } = await req.json() as { listingId: string; platform: string };

    if (!listingId || !platform) {
      return Response.json({ error: "listingId and platform are required" }, { status: 400 });
    }

    const dbListing = await getListingById(user.id, listingId);
    if (!dbListing) return Response.json({ error: "Listing not found" }, { status: 404 });

    const platformListing = (dbListing.platform_listings ?? []).find((pl) => pl.platform === platform);
    if (!platformListing?.platform_listing_id) {
      return Response.json({ error: `No active ${platform} listing found` }, { status: 404 });
    }

    const conn = await getConnection(user.id, platform);
    if (!conn) return Response.json({ error: `Not connected to ${platform}` }, { status: 400 });

    const tokens = decryptTokens(conn.encrypted_tokens);

    let result;
    if (platform === "grailed") {
      result = await delistFromGrailed(platformListing.platform_listing_id, tokens as GrailedTokens);
    } else if (platform === "depop") {
      result = await delistFromDepop(platformListing.platform_listing_id, tokens as DepopTokens);
    } else {
      return Response.json({ error: "eBay not yet supported" }, { status: 400 });
    }

    console.log(JSON.stringify({
      event: result.ok ? "delist.success" : "delist.failure",
      platform: platform as Platform,
      listing_id: listingId,
    }));

    if (result.ok) {
      await updatePlatformListingStatus(listingId, platform as Platform, "delisted");
      return Response.json({ ok: true });
    } else {
      return Response.json({ ok: false, error: result.error }, { status: 502 });
    }
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("POST /api/delist", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
