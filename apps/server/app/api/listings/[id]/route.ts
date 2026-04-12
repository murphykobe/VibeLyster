import { NextRequest, after } from "next/server";
import { requireAuth, AuthError, authErrorResponse } from "@/lib/auth";
import { getConnection, getListingById, updateListing, updatePlatformListingStatus, softDeleteListing } from "@/lib/db";
import { UpdateListingBody, parseBody } from "@/lib/validation";
import { coerceCategoryForStorage } from "@/lib/categories";
import { decryptTokens } from "@/lib/crypto";
import { publishToGrailed } from "@/lib/marketplace/grailed";
import { syncLinkedGrailedDraftAfterSave } from "@/lib/marketplace/grailed-save-sync";
import { getDisplaySizeValue, parseStructuredSize } from "@/lib/sizes";
import { isMockMode } from "@/lib/mock";
import type { CanonicalListing, GrailedTokens } from "@/lib/marketplace/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const listing = await getListingById(user.id, id);
    if (!listing) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json(listing);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("GET /api/listings/[id]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const parsed = parseBody(UpdateListingBody, await req.json());
    if ("error" in parsed) return parsed.error;
    const categoryResult = coerceCategoryForStorage(parsed.data.category);
    if (!categoryResult.ok) {
      return Response.json({ error: categoryResult.error }, { status: 400 });
    }

    const updated = await updateListing(user.id, id, {
      ...parsed.data,
      size: parsed.data.size ?? undefined,
      condition: parsed.data.condition ?? undefined,
      brand: parsed.data.brand ?? undefined,
      category: categoryResult.category,
      traits: parsed.data.traits as Record<string, unknown> | undefined,
    });

    if (!updated) return Response.json({ error: "Not found" }, { status: 404 });

    if (!isMockMode()) {
      after((async () => {
        const listing = await getListingById(user.id, id);
        const grailedPlatformListing = (listing?.platform_listings ?? []).find((pl) => pl.platform === "grailed") ?? null;
        const conn = await getConnection(user.id, "grailed");
        if (!listing || !grailedPlatformListing || !conn) return;

        const canonical: CanonicalListing = {
          id: listing.id,
          title: listing.title ?? "",
          description: listing.description ?? "",
          price: Number(listing.price ?? 0),
          size: getDisplaySizeValue(listing.size),
          structuredSize: parseStructuredSize(listing.size),
          condition: listing.condition,
          brand: listing.brand,
          category: listing.category,
          traits: (listing.traits as Record<string, string>) ?? {},
          photos: (listing.photos as string[]) ?? [],
        };

        await syncLinkedGrailedDraftAfterSave({
          listingId: id,
          platformListing: {
            platform_listing_id: grailedPlatformListing.platform_listing_id,
            platform_data: (grailedPlatformListing.platform_data ?? {}) as Record<string, unknown>,
            status: grailedPlatformListing.status,
          },
          publishDraft: () => publishToGrailed(canonical, decryptTokens(conn.encrypted_tokens) as GrailedTokens, {
            mode: "draft",
            existingPlatformListingId: grailedPlatformListing.platform_listing_id,
            existingPlatformData: grailedPlatformListing.platform_data ?? null,
          }),
          updateStatus: updatePlatformListingStatus,
        });
      })());
    }

    return Response.json(updated);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("PUT /api/listings/[id]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;

    // Prevent delete if any platform is still live
    const listing = await getListingById(user.id, id);
    if (!listing) return Response.json({ error: "Not found" }, { status: 404 });

    const livePlatforms = (listing.platform_listings ?? []).filter(
      (pl) => pl.status === "live" || pl.status === "publishing"
    );
    if (livePlatforms.length > 0) {
      return Response.json(
        { error: "Delist from all platforms before deleting", platforms: livePlatforms.map((p) => p.platform) },
        { status: 409 }
      );
    }

    await softDeleteListing(user.id, id);
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("DELETE /api/listings/[id]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
