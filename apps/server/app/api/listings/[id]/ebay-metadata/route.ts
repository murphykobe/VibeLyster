import { NextRequest } from "next/server";
import { requireAuth, AuthError, authErrorResponse } from "@/lib/auth";
import { getListingById, upsertPlatformListing } from "@/lib/db";
import { UpdateEbayMetadataBody, parseBody } from "@/lib/validation";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(req);
    const { id } = await params;
    const parsed = parseBody(UpdateEbayMetadataBody, await req.json());
    if ("error" in parsed) return parsed.error;

    const listing = await getListingById(user.id, id);
    if (!listing) return Response.json({ error: "Not found" }, { status: 404 });

    const existing = listing.platform_listings?.find((row) => row.platform === "ebay");
    const platformData = {
      ...(existing?.platform_data ?? {}),
      ...parsed.data,
      validationStatus: "incomplete",
    };

    const row = await upsertPlatformListing(id, "ebay", {
      status: existing?.status ?? "pending",
      platform_listing_id: existing?.platform_listing_id ?? null,
      platform_data: platformData,
      last_error: existing?.last_error ?? null,
      attempt_count: existing?.attempt_count ?? 0,
    });

    return Response.json(row);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("PATCH /api/listings/[id]/ebay-metadata", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
