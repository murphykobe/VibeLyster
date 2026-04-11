/**
 * AI generation pipeline.
 *
 * Flow:
 * 1. Soniox transcribes voice note → text
 * 2. Text-first structured generation creates a partial listing draft and
 *    explicitly marks unresolved / low-confidence fields.
 * 3. A deterministic router decides whether image-derivable gaps justify a
 *    single vision fallback call.
 * 4. The final canonical listing plus internal verification metadata is stored
 *    with the draft so the UI can surface a simple "Requires verification"
 *    state without exposing internal categories.
 *
 * STT provider: Soniox REST API (SONIOX_API_KEY)
 * Generation provider: Vercel AI Gateway (prefer AI_GATEWAY_API_KEY, fallback
 * to VERCEL_OIDC_TOKEN)
 */

import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { CANONICAL_CATEGORY_KEYS, normalizeCategoryForStorage } from "./categories";
import { ALL_SIZE_SYSTEMS, getSizeSystemsForCategory, isTopCategory, translateApparelSizeToTopSize, type SizeSystem } from "./sizes";

// ─── Vercel AI Gateway client ─────────────────────────────────────────────────

function getGatewayClient() {
  const apiKey = process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_OIDC_TOKEN;
  if (!apiKey) {
    throw new Error("AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN is required");
  }

  return createOpenAI({
    baseURL: "https://ai-gateway.vercel.sh/v1",
    apiKey,
  });
}

// ─── Models & verification metadata ──────────────────────────────────────────

const TEXT_MODEL_ID = "google/gemini-2.5-flash";
const VISION_MODEL_ID = "google/gemini-2.5-flash";

const VerificationFieldEnum = z.enum(["title", "description", "brand", "size", "condition", "category", "color", "price"]);
export type VerificationField = z.infer<typeof VerificationFieldEnum>;

const IMAGE_DERIVABLE_FIELDS = new Set<VerificationField>([
  "title",
  "description",
  "brand",
  "size",
  "condition",
  "category",
  "color",
]);

export type ListingVerificationMetadata = {
  verificationStatus: "verified" | "requires_verification";
  unresolvedFields: VerificationField[];
  lowConfidenceFields: VerificationField[];
  fallbackTriggered: boolean;
  fallbackReason: VerificationField[];
  fallbackResolvedFields: VerificationField[];
  resolutionSource: Partial<Record<VerificationField, "text" | "vision" | "user">>;
};

export function getListingGenerationModelId(input: { useVision: boolean }) {
  return input.useVision ? VISION_MODEL_ID : TEXT_MODEL_ID;
}

export function getVisionFallbackFields(input: {
  unresolvedFields: VerificationField[];
  lowConfidenceFields: VerificationField[];
}) {
  return [...new Set([...input.unresolvedFields, ...input.lowConfidenceFields])].filter((field) =>
    IMAGE_DERIVABLE_FIELDS.has(field)
  );
}

export function shouldUseVisionFallback(input: {
  photoUrls: string[];
  unresolvedFields: VerificationField[];
  lowConfidenceFields: VerificationField[];
}) {
  return input.photoUrls.length > 0 && getVisionFallbackFields(input).length > 0;
}

function getVerificationStatus(input: {
  unresolvedFields: VerificationField[];
  lowConfidenceFields: VerificationField[];
}): ListingVerificationMetadata["verificationStatus"] {
  return input.unresolvedFields.length > 0 || input.lowConfidenceFields.length > 0
    ? "requires_verification"
    : "verified";
}

function uniqueFields(fields: VerificationField[]) {
  return [...new Set(fields)];
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ListingSchema = z.object({
  title: z.string().nullable().describe("Short, keyword-rich listing title (max 70 chars). Platform-optimized for search. Use null if unknown."),
  description: z.string().nullable().describe("Detailed item description including condition notes, measurements, and any flaws. Use null if unknown."),
  price: z.number().positive().nullable().describe("Listing price in USD. Use null if unknown; do not guess."),
  size: z.object({ system: z.string(), value: z.string() }).nullable().describe(
    "Structured size with system (e.g. US_MENS_SHOE, CLOTHING_LETTER, PANTS_WAIST) and value. null if unknown."
  ),
  condition: z.enum(["new", "gently_used", "used", "heavily_used"]).nullable().describe("Item condition. null if unknown."),
  brand: z.string().nullable().describe("Brand name (e.g. 'Nike', 'Levi\'s'). null if unknown."),
  category: z.enum(CANONICAL_CATEGORY_KEYS).nullable().describe(
    "Canonical supported category key. Choose only from the provided enum. Use null if transcript/images do not support a confident category."
  ),
  traits: z.record(z.string()).describe(
    "Additional attributes as key-value pairs. Include traits.color when identifiable. Omit keys that are unknown."
  ),
});

const StructuredDraftSchema = z.object({
  listing: ListingSchema,
  unresolvedFields: z.array(VerificationFieldEnum).default([]),
  lowConfidenceFields: z.array(VerificationFieldEnum).default([]),
});

type GeneratedListing = z.infer<typeof ListingSchema>;
type StructuredDraft = z.infer<typeof StructuredDraftSchema>;

// ─── Soniox transcription ────────────────────────────────────────────────────

type SonioxFileResponse = {
  id: string;
  filename: string;
};

type SonioxTranscriptionStatus = "queued" | "processing" | "completed" | "error";

type SonioxTranscriptionResponse = {
  id: string;
  status: SonioxTranscriptionStatus;
  error_message?: string | null;
};

type SonioxTranscriptResponse = {
  id: string;
  text: string;
};

const SONIOX_API_BASE = "https://api.soniox.com/v1";
const SONIOX_ASYNC_MODEL = "stt-async-v4";
const SONIOX_POLL_INTERVAL_MS = 250;
const SONIOX_MAX_POLL_ATTEMPTS = 40;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function transcribeAudio(audioBuffer: ArrayBuffer, mimeType: string): Promise<string> {
  const startMs = Date.now();
  const apiKey = process.env.SONIOX_API_KEY;
  if (!apiKey) throw new Error("SONIOX_API_KEY is required");

  const ext = mimeType.includes("mp4") || mimeType.includes("m4a") ? "m4a" : "webm";
  const headers = { Authorization: `Bearer ${apiKey}` };

  const uploadForm = new FormData();
  const blob = new Blob([audioBuffer], { type: mimeType });
  uploadForm.append("file", blob, `voice.${ext}`);

  const uploadResponse = await fetch(`${SONIOX_API_BASE}/files`, {
    method: "POST",
    headers,
    body: uploadForm,
  });

  if (!uploadResponse.ok) {
    const text = await uploadResponse.text();
    throw new Error(`Soniox file upload failed ${uploadResponse.status}: ${text}`);
  }

  const uploadedFile = await uploadResponse.json() as SonioxFileResponse;
  console.log(JSON.stringify({
    event: "ai.transcription.upload_complete",
    latency_ms: Date.now() - startMs,
  }));

  const createResponse = await fetch(`${SONIOX_API_BASE}/transcriptions`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: SONIOX_ASYNC_MODEL,
      file_id: uploadedFile.id,
    }),
  });

  if (!createResponse.ok) {
    const text = await createResponse.text();
    throw new Error(`Soniox create transcription failed ${createResponse.status}: ${text}`);
  }

  let transcription = await createResponse.json() as SonioxTranscriptionResponse;
  console.log(JSON.stringify({
    event: "ai.transcription.create_complete",
    latency_ms: Date.now() - startMs,
  }));

  let attempt = 0;
  for (; attempt < SONIOX_MAX_POLL_ATTEMPTS && transcription.status !== "completed"; attempt++) {
    if (transcription.status === "error") {
      throw new Error(`Soniox transcription failed: ${transcription.error_message ?? "Unknown error"}`);
    }

    await sleep(SONIOX_POLL_INTERVAL_MS);

    const pollResponse = await fetch(`${SONIOX_API_BASE}/transcriptions/${transcription.id}`, {
      headers,
    });

    if (!pollResponse.ok) {
      const text = await pollResponse.text();
      throw new Error(`Soniox get transcription failed ${pollResponse.status}: ${text}`);
    }

    transcription = await pollResponse.json() as SonioxTranscriptionResponse;
  }

  console.log(JSON.stringify({
    event: "ai.transcription.poll_complete",
    latency_ms: Date.now() - startMs,
    poll_attempts: attempt,
  }));

  if (transcription.status !== "completed") {
    throw new Error(`Soniox transcription did not complete in time (last status: ${transcription.status})`);
  }

  const transcriptResponse = await fetch(`${SONIOX_API_BASE}/transcriptions/${transcription.id}/transcript`, {
    headers,
  });

  if (!transcriptResponse.ok) {
    const text = await transcriptResponse.text();
    throw new Error(`Soniox get transcript failed ${transcriptResponse.status}: ${text}`);
  }

  const transcript = await transcriptResponse.json() as SonioxTranscriptResponse;
  console.log(JSON.stringify({
    event: "ai.transcription.total",
    latency_ms: Date.now() - startMs,
    transcript_length: transcript.text.trim().length,
  }));
  return transcript.text.trim();
}

// ─── Listing generation ───────────────────────────────────────────────────────

const SIZE_SYSTEM_PROMPT = Object.entries(ALL_SIZE_SYSTEMS)
  .map(([system, values]) => `- ${system}: ${values.join(", ")}`)
  .join("\n");

const SYSTEM_PROMPT = `You are an expert reseller who creates optimized marketplace listings.
Generate a canonical listing draft from the provided information.
- Titles should be keyword-rich and under 70 characters
- Descriptions should mention condition notes, measurements, and any flaws when known
- Be accurate — do not invent details not supported by the transcript or images
- Use null for unknown brand, size, condition, and category
- Size must be a structured object { system, value } when known
- Use only these size systems. The values listed below are common examples, not an exhaustive allowed list:
${SIZE_SYSTEM_PROMPT}
- Category group to allowed size systems:
  - footwear -> US_MENS_SHOE, US_WOMENS_SHOE, EU_SHOE, UK_SHOE
  - tops, outerwear, tailoring -> CLOTHING_LETTER, EU_CLOTHING, IT_CLOTHING
  - bottoms -> PANTS_WAIST, CLOTHING_LETTER, EU_CLOTHING
  - accessories, bags -> ONE_SIZE, CLOTHING_LETTER
- Examples:
  - Sneakers size 10.5 -> { "system": "US_MENS_SHOE", "value": "10.5" }
  - Hoodie medium -> { "system": "CLOTHING_LETTER", "value": "M" }
  - Jeans waist 32 -> { "system": "PANTS_WAIST", "value": "32" }
  - Bag one size -> { "system": "ONE_SIZE", "value": "ONE SIZE" }
- Omit unknown traits (for example omit color if unknown)
- If a field is unresolved, include it in unresolvedFields
- If you provide a weak best-effort value that still needs human review, include it in lowConfidenceFields
- Category must be one of the canonical supported category enum values when known
- If the item is outside our supported fashion/accessory categories and you are confident about that, use unsupported.other`;

const COLOR_KEYWORDS: Array<[string, string]> = [
  ["off-white", "cream"],
  ["off white", "cream"],
  ["ivory", "cream"],
  ["beige", "cream"],
  ["tan", "cream"],
  ["khaki", "cream"],
  ["multicolor", "multi"],
  ["multi color", "multi"],
  ["multi-color", "multi"],
  ["gray", "grey"],
  ["grey", "grey"],
  ["black", "black"],
  ["white", "white"],
  ["blue", "blue"],
  ["red", "red"],
  ["green", "green"],
  ["silver", "silver"],
  ["gold", "gold"],
  ["brown", "brown"],
  ["navy", "navy"],
  ["orange", "orange"],
  ["pink", "pink"],
  ["purple", "purple"],
  ["yellow", "yellow"],
];

function inferColorFromText(...sources: Array<string | null | undefined>) {
  const haystack = sources.filter(Boolean).join(" ").toLowerCase();
  if (!haystack) return null;

  for (const [needle, color] of COLOR_KEYWORDS) {
    if (haystack.includes(needle)) return color;
  }

  return null;
}

function hasFieldValue(listing: GeneratedListing, field: VerificationField) {
  switch (field) {
    case "title":
      return Boolean(listing.title?.trim());
    case "description":
      return Boolean(listing.description?.trim());
    case "brand":
      return Boolean(listing.brand?.trim());
    case "size":
      return Boolean(listing.size?.system && listing.size?.value);
    case "condition":
      return Boolean(listing.condition);
    case "category":
      return Boolean(listing.category);
    case "color":
      return Boolean(listing.traits?.color?.trim());
    case "price":
      return listing.price != null && Number.isFinite(listing.price) && listing.price > 0;
  }
}

export function normalizeGeneratedSizeForTest(
  size: GeneratedListing["size"],
  category: GeneratedListing["category"],
): GeneratedListing["size"] {
  if (!size) return null;

  const system = size.system.trim().toUpperCase() as SizeSystem;
  if (!(system in ALL_SIZE_SYSTEMS)) return null;

  const rawValue = size.value.trim();
  if (!rawValue) return null;

  if (isTopCategory(category)) {
    const translated = translateApparelSizeToTopSize(system, rawValue);
    if (!translated) return null;
    return { system: "CLOTHING_LETTER", value: translated };
  }

  const value = system === "CLOTHING_LETTER" || system === "ONE_SIZE"
    ? rawValue.toUpperCase()
    : rawValue;

  const allowedSystems = getSizeSystemsForCategory(category);
  if (allowedSystems.length > 0 && !allowedSystems.includes(system)) return null;

  return { system, value };
}

function normalizeGeneratedListing(listing: GeneratedListing, transcript: string): GeneratedListing {
  const traits = { ...(listing.traits ?? {}) };
  const inferredColor = typeof traits.color === "string" && traits.color.trim()
    ? traits.color.trim().toLowerCase()
    : inferColorFromText(listing.title, listing.description, listing.category, transcript);

  if (inferredColor) {
    traits.color = inferredColor;
  }

  return {
    ...listing,
    title: listing.title?.trim() || null,
    description: listing.description?.trim() || null,
    size: normalizeGeneratedSizeForTest(listing.size, listing.category),
    category: listing.category ? normalizeCategoryForStorage(listing.category) : null,
    traits,
  };
}

function normalizeStructuredDraft(draft: StructuredDraft, transcript: string): StructuredDraft {
  const listing = normalizeGeneratedListing(draft.listing, transcript);
  const unresolvedFields = uniqueFields(draft.unresolvedFields).filter((field) => !hasFieldValue(listing, field));
  const lowConfidenceFields = uniqueFields(draft.lowConfidenceFields).filter(
    (field) => !unresolvedFields.includes(field)
  );

  return {
    listing,
    unresolvedFields,
    lowConfidenceFields,
  };
}

async function generateWithText(transcript: string): Promise<StructuredDraft> {
  const client = getGatewayClient();

  const { object } = await generateObject({
    model: client(getListingGenerationModelId({ useVision: false })),
    schema: StructuredDraftSchema,
    system: SYSTEM_PROMPT,
    prompt: `Create a marketplace listing draft from this transcript only. Do not use image information.

Transcript: "${transcript || ""}"`,
  });

  return object;
}

async function generateWithVision(input: {
  transcript: string;
  photoUrls: string[];
  partialDraft: GeneratedListing;
  fallbackFields: VerificationField[];
}): Promise<StructuredDraft> {
  const client = getGatewayClient();

  const imageContent = input.photoUrls.slice(0, 4).map((url) => ({
    type: "image" as const,
    image: url,
  }));

  const { object } = await generateObject({
    model: client(getListingGenerationModelId({ useVision: true })),
    schema: StructuredDraftSchema,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          ...imageContent,
          {
            type: "text",
            text: [
              "Complete this marketplace listing using the images plus the transcript.",
              "Preserve existing draft values unless the images clearly improve unresolved image-derivable fields.",
              `Transcript: ${input.transcript || "No voice description provided."}`,
              `Current draft JSON: ${JSON.stringify(input.partialDraft)}`,
              `Fields that need image help: ${JSON.stringify(input.fallbackFields)}`,
              "Return the full listing object plus unresolvedFields and lowConfidenceFields.",
            ].join("\n"),
          },
        ],
      },
    ],
  });

  return object;
}

function buildVerificationMetadata(input: {
  pass1: StructuredDraft;
  final: StructuredDraft;
  fallbackTriggered: boolean;
  fallbackReason: VerificationField[];
}): ListingVerificationMetadata {
  const unresolvedFields = uniqueFields(input.final.unresolvedFields);
  const lowConfidenceFields = uniqueFields(input.final.lowConfidenceFields).filter(
    (field) => !unresolvedFields.includes(field)
  );
  const resolutionSource: Partial<Record<VerificationField, "text" | "vision" | "user">> = {};

  for (const field of VerificationFieldEnum.options) {
    const finalNeedsVerification = unresolvedFields.includes(field) || lowConfidenceFields.includes(field);
    if (finalNeedsVerification) continue;

    const pass1NeededVerification =
      input.pass1.unresolvedFields.includes(field) || input.pass1.lowConfidenceFields.includes(field);

    resolutionSource[field] = input.fallbackTriggered && pass1NeededVerification ? "vision" : "text";
  }

  const fallbackResolvedFields = input.fallbackReason.filter(
    (field) => !unresolvedFields.includes(field) && !lowConfidenceFields.includes(field)
  );

  return {
    verificationStatus: getVerificationStatus({ unresolvedFields, lowConfidenceFields }),
    unresolvedFields,
    lowConfidenceFields,
    fallbackTriggered: input.fallbackTriggered,
    fallbackReason: uniqueFields(input.fallbackReason),
    fallbackResolvedFields,
    resolutionSource,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type GenerateListingInput = {
  audioBuffer?: ArrayBuffer;
  audioMimeType?: string;
  photoUrls: string[];
  transcript?: string;
};

export type GenerateListingResult = {
  listing: GeneratedListing;
  voiceTranscript: string | null;
  aiRawResponse: Record<string, unknown>;
  usedVision: boolean;
};

const EbayAspectSchema = z.record(z.array(z.string().min(1))).describe(
  "Map each requested eBay aspect name to one or more values. Only include requested aspects."
);

export async function generateEbayAspects(input: {
  listing: {
    title: string;
    description: string;
    brand: string | null;
    size: string | null;
    category: string | null;
    traits: Record<string, string>;
  };
  missingAspects: string[];
}): Promise<Record<string, string[]>> {
  if (input.missingAspects.length === 0) return {};

  const client = getGatewayClient();
  const { object } = await generateObject({
    model: client(TEXT_MODEL_ID),
    schema: EbayAspectSchema,
    system: "You generate only missing eBay item specifics for fashion/apparel listings. Return compact JSON only. Do not invent facts that strongly contradict the listing.",
    prompt: JSON.stringify({
      listing: input.listing,
      missingAspects: input.missingAspects,
    }),
  });

  return object;
}

export async function generateListing(input: GenerateListingInput): Promise<GenerateListingResult> {
  const generateStartMs = Date.now();
  const { audioBuffer, audioMimeType, photoUrls, transcript: providedTranscript } = input;

  let transcript = providedTranscript?.trim() ?? "";
  let transcriptionMs: number | null = null;
  if (!transcript && audioBuffer && audioMimeType) {
    const transcriptionStartMs = Date.now();
    transcript = await transcribeAudio(audioBuffer, audioMimeType);
    transcriptionMs = Date.now() - transcriptionStartMs;
    console.log(JSON.stringify({
      event: "ai.transcription_complete",
      transcript_length: transcript.length,
      transcription_latency_ms: transcriptionMs,
    }));
  } else if (transcript) {
    console.log(JSON.stringify({ event: "ai.transcript_provided", transcript_length: transcript.length }));
  }

  const pass1StartMs = Date.now();
  const pass1Raw = await generateWithText(transcript);
  const pass1 = normalizeStructuredDraft(pass1Raw, transcript);
  const pass1LatencyMs = Date.now() - pass1StartMs;

  console.log(JSON.stringify({
    event: "ai.pass1.completed",
    latency_ms: pass1LatencyMs,
    model: TEXT_MODEL_ID,
    transcript_length: transcript.length,
    unresolved_fields: pass1.unresolvedFields,
    low_confidence_fields: pass1.lowConfidenceFields,
    photo_count: photoUrls.length,
  }));

  const fallbackReason = getVisionFallbackFields({
    unresolvedFields: pass1.unresolvedFields,
    lowConfidenceFields: pass1.lowConfidenceFields,
  });
  const useVision = shouldUseVisionFallback({
    photoUrls,
    unresolvedFields: pass1.unresolvedFields,
    lowConfidenceFields: pass1.lowConfidenceFields,
  });

  let finalDraft = pass1;
  let pass2LatencyMs: number | null = null;

  if (useVision) {
    console.log(JSON.stringify({
      event: "ai.pass1.requires_vision",
      model: VISION_MODEL_ID,
      fallback_reason: fallbackReason,
      photo_count: photoUrls.length,
    }));

    const pass2StartMs = Date.now();
    const pass2Raw = await generateWithVision({
      transcript,
      photoUrls,
      partialDraft: pass1.listing,
      fallbackFields: fallbackReason,
    });
    finalDraft = normalizeStructuredDraft(pass2Raw, transcript);
    pass2LatencyMs = Date.now() - pass2StartMs;

    console.log(JSON.stringify({
      event: "ai.pass2.completed",
      latency_ms: pass2LatencyMs,
      model: VISION_MODEL_ID,
      fallback_reason: fallbackReason,
      unresolved_fields: finalDraft.unresolvedFields,
      low_confidence_fields: finalDraft.lowConfidenceFields,
    }));
  } else {
    console.log(JSON.stringify({
      event: "ai.pass1.accepted",
      model: TEXT_MODEL_ID,
      unresolved_fields: pass1.unresolvedFields,
      low_confidence_fields: pass1.lowConfidenceFields,
    }));
  }

  const verification = buildVerificationMetadata({
    pass1,
    final: finalDraft,
    fallbackTriggered: useVision,
    fallbackReason,
  });

  console.log(JSON.stringify({
    event: "ai.generation_complete",
    used_vision: useVision,
    verification_status: verification.verificationStatus,
    unresolved_fields: verification.unresolvedFields,
    low_confidence_fields: verification.lowConfidenceFields,
  }));
  console.log(JSON.stringify({
    event: "ai.generate_total",
    total_ms: Date.now() - generateStartMs,
    transcription_ms: transcriptionMs ?? null,
    pass1_ms: pass1LatencyMs,
    pass2_ms: pass2LatencyMs ?? null,
  }));

  return {
    listing: finalDraft.listing,
    voiceTranscript: transcript || null,
    aiRawResponse: {
      listing: finalDraft.listing,
      transcript,
      usedVision: useVision,
      verification,
      pass1: {
        model: TEXT_MODEL_ID,
        unresolvedFields: pass1.unresolvedFields,
        lowConfidenceFields: pass1.lowConfidenceFields,
      },
      pass2: useVision
        ? {
            model: VISION_MODEL_ID,
            fallbackReason,
            unresolvedFields: finalDraft.unresolvedFields,
            lowConfidenceFields: finalDraft.lowConfidenceFields,
          }
        : null,
    },
    usedVision: useVision,
  };
}
