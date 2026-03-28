import { NextRequest } from "next/server";
import { requireAuth, AuthError, authErrorResponse } from "@/lib/auth";
import { generateListing } from "@/lib/ai";
import { createListing } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const formData = await req.formData();

    // Parse photo URLs (comma-separated or multiple fields)
    const photosRaw = formData.get("photos") as string | null;
    const photoUrls = photosRaw ? photosRaw.split(",").map((u) => u.trim()).filter(Boolean) : [];

    // Parse audio (optional)
    const audioFile = formData.get("audio") as File | null;
    let audioBuffer: ArrayBuffer | undefined;
    let audioMimeType: string | undefined;
    if (audioFile) {
      audioBuffer = await audioFile.arrayBuffer();
      audioMimeType = audioFile.type || "audio/m4a";
    }

    if (!audioBuffer && photoUrls.length === 0) {
      return Response.json({ error: "At least one photo URL or audio file is required" }, { status: 400 });
    }

    // Run AI pipeline
    const result = await generateListing({ audioBuffer, audioMimeType, photoUrls });

    // Save draft to DB
    const listing = await createListing({
      userId: user.id,
      title: result.listing.title,
      description: result.listing.description,
      price: result.listing.price,
      size: result.listing.size ?? undefined,
      condition: result.listing.condition,
      brand: result.listing.brand ?? undefined,
      category: result.listing.category ?? undefined,
      traits: result.listing.traits,
      photos: photoUrls,
      voiceTranscript: result.voiceTranscript ?? undefined,
      aiRawResponse: result.aiRawResponse,
    });

    console.log(JSON.stringify({ event: "ai.draft_created", listing_id: listing.id, used_vision: result.usedVision }));

    return Response.json({ listing }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("POST /api/generate", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
