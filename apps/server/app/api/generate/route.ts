import { NextRequest } from "next/server";
import { requireAuth, AuthError, authErrorResponse } from "@/lib/auth";
import { generateListing } from "@/lib/ai";
import { createListing } from "@/lib/db";
import { isMockMode } from "@/lib/mock";

function buildMockListing(photoUrls: string[], hasAudio: boolean, transcript?: string | null) {
  const titleSuffix = photoUrls.length > 0 ? `${photoUrls.length} Photos` : transcript ? "Transcript Draft" : "Voice Draft";
  return {
    title: `Mock Listing - ${titleSuffix}`,
    description: transcript?.trim() || "Mock-generated listing for local frontend E2E testing.",
    price: 48,
    size: "M",
    condition: "gently_used",
    brand: "Mock Brand",
    category: "t-shirt",
    traits: {
      color: "black",
      material: "cotton",
      source: "mock_mode",
      hasAudio: String(hasAudio),
      hasTranscript: String(Boolean(transcript?.trim())),
    },
  };
}

type GeneratedDraft = {
  title: string;
  description: string;
  price: number;
  size: string | null;
  condition: string | null;
  brand: string | null;
  category: string | null;
  traits: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req);

    const formData = await req.formData();

    // Parse photo URLs (comma-separated or multiple fields)
    const photosRaw = formData.get("photos") as string | null;
    const photoUrls = photosRaw ? photosRaw.split(",").map((u) => u.trim()).filter(Boolean) : [];

    const transcript = String(formData.get("transcript") ?? "").trim();

    // Parse audio (optional)
    const audioFile = formData.get("audio") as File | null;
    let audioBuffer: ArrayBuffer | undefined;
    let audioMimeType: string | undefined;
    if (audioFile) {
      audioBuffer = await audioFile.arrayBuffer();
      audioMimeType = audioFile.type || "audio/m4a";
    }

    if (!transcript && !audioBuffer && photoUrls.length === 0) {
      return Response.json({ error: "At least one photo URL, transcript, or audio file is required" }, { status: 400 });
    }

    let generated: {
      listing: GeneratedDraft;
      voiceTranscript: string | null;
      aiRawResponse: Record<string, unknown>;
      usedVision: boolean;
    };

    if (isMockMode()) {
      generated = {
        listing: buildMockListing(photoUrls, Boolean(audioBuffer), transcript || null),
        voiceTranscript: transcript || (audioBuffer ? "[mock transcript] voice input received" : null),
        aiRawResponse: {
          mock: true,
          photoCount: photoUrls.length,
          hadAudio: Boolean(audioBuffer),
          hadTranscript: Boolean(transcript),
        },
        usedVision: photoUrls.length > 0,
      };
    } else {
      const result = await generateListing({ audioBuffer, audioMimeType, photoUrls, transcript });
      generated = {
        listing: result.listing as GeneratedDraft,
        voiceTranscript: result.voiceTranscript,
        aiRawResponse: result.aiRawResponse,
        usedVision: result.usedVision,
      };
    }

    // Save draft to DB
    const listing = await createListing({
      userId: user.id,
      title: generated.listing.title,
      description: generated.listing.description,
      price: generated.listing.price,
      size: generated.listing.size ?? undefined,
      condition: generated.listing.condition ?? undefined,
      brand: generated.listing.brand ?? undefined,
      category: generated.listing.category ?? undefined,
      traits: generated.listing.traits,
      photos: photoUrls,
      voiceTranscript: generated.voiceTranscript ?? undefined,
      aiRawResponse: generated.aiRawResponse,
    });

    console.log(JSON.stringify({
      event: "ai.draft_created",
      listing_id: listing.id,
      used_vision: generated.usedVision,
      mock: isMockMode(),
    }));

    return Response.json({ listing }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return authErrorResponse(err);
    console.error("POST /api/generate", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
