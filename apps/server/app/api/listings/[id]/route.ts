import { NextRequest } from "next/server";
import { requireAuth, AuthError, authErrorResponse } from "@/lib/auth";
import { getListingById, updateListing, softDeleteListing } from "@/lib/db";
import { UpdateListingBody, parseBody } from "@/lib/validation";
import { coerceCategoryForStorage } from "@/lib/categories";

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
