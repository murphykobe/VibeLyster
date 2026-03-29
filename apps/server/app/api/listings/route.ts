import { NextRequest } from "next/server";
import { requireAuth, AuthError, authErrorResponse } from "@/lib/auth";
import { getListings, createListing } from "@/lib/db";
import { CreateListingBody, parseBody } from "@/lib/validation";

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
    const parsed = parseBody(CreateListingBody, await req.json());
    if ("error" in parsed) return parsed.error;
    const { title, description, price, size, condition, brand, category, traits, photos, voiceTranscript, aiRawResponse } = parsed.data;

    const listing = await createListing({
      userId: user.id,
      title,
      description,
      price,
      size: size ?? undefined,
      condition: condition ?? undefined,
      brand: brand ?? undefined,
      category: category ?? undefined,
      traits: traits as Record<string, unknown> | undefined,
      photos,
      voiceTranscript: voiceTranscript ?? undefined,
      aiRawResponse: aiRawResponse ?? undefined,
    });

    return Response.json(listing, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("POST /api/listings", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
