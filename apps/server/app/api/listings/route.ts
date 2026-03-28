import { NextRequest } from "next/server";
import { requireAuth, AuthError, authErrorResponse } from "@/lib/auth";
import { getListings, createListing } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const listings = await getListings(user.id);
    return Response.json(listings);
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("GET /api/listings", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const body = await req.json();

    const { title, description, price, size, condition, brand, category, traits, photos, voiceTranscript, aiRawResponse } = body;
    if (!title || !description || price == null || !Array.isArray(photos)) {
      return Response.json({ error: "title, description, price, and photos are required" }, { status: 400 });
    }

    const listing = await createListing({
      userId: user.id,
      title,
      description,
      price: Number(price),
      size,
      condition,
      brand,
      category,
      traits,
      photos,
      voiceTranscript,
      aiRawResponse,
    });

    return Response.json(listing, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("POST /api/listings", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
