import { NextRequest, after } from "next/server";
import { requireAuth, AuthError, authErrorResponse } from "@/lib/auth";
import { generateListing } from "@/lib/ai";
import { createListing, updateListingGeneration } from "@/lib/db";
import { isMockMode } from "@/lib/mock";

function buildMockListing(photoUrls: string[], hasAudio: boolean, transcript?: string | null) {
  const titleSuffix = photoUrls.length > 0 ? `${photoUrls.length} Photos` : transcript ? "Transcript Draft" : "Voice Draft";
  return {
    title: `Mock Listing - ${titleSuffix}`,
    description: transcript?.trim() || "Mock-generated listing for local frontend E2E testing.",
    price: 48,
    size: { system: "CLOTHING_LETTER", value: "M" },
    condition: "gently_used",
    brand: "Mock Brand",
    category: "tops.t_shirt",
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
  title: string | null;
  description: string | null;
  price: number | null;
  size: { system: string; value: string } | null;
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

    if (!isMockMode()) {
      const listing = await createListing({
        userId: user.id,
        title: null,
        description: null,
        price: null,
        photos: photoUrls,
        generation_status: "generating",
      });

      after((async () => {
        try {
          const generated = await generateListing({ audioBuffer, audioMimeType, photoUrls, transcript });
          await updateListingGeneration(listing.id, {
            generation_status: "complete",
            generation_error: null,
            title: generated.listing.title,
            description: generated.listing.description,
            price: generated.listing.price,
            size: generated.listing.size ? JSON.stringify(generated.listing.size) : null,
            condition: generated.listing.condition,
            brand: generated.listing.brand,
            category: generated.listing.category,
            traits: generated.listing.traits,
            voiceTranscript: generated.voiceTranscript,
            aiRawResponse: generated.aiRawResponse,
            photos: photoUrls,
          });
        } catch (err) {
          console.error("POST /api/generate background", err);
          await updateListingGeneration(listing.id, {
            generation_status: "failed",
            generation_error: err instanceof Error ? err.message : "Generation failed",
          }).catch((updateErr) => {
            console.error("POST /api/generate background update failed", updateErr);
          });
        }
      })());

      return Response.json({ listing }, { status: 201 });
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
          verification: {
            verificationStatus: "verified",
            unresolvedFields: [],
            lowConfidenceFields: [],
            fallbackTriggered: false,
            fallbackReason: [],
            fallbackResolvedFields: [],
            resolutionSource: {},
          },
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
      size: generated.listing.size ? JSON.stringify(generated.listing.size) : undefined,
      condition: generated.listing.condition ?? undefined,
      brand: generated.listing.brand ?? undefined,
      category: generated.listing.category ?? undefined,
      traits: generated.listing.traits,
      photos: photoUrls,
      voiceTranscript: generated.voiceTranscript ?? undefined,
      aiRawResponse: generated.aiRawResponse,
      generation_status: "complete",
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
