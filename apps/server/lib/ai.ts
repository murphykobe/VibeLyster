/**
 * AI generation pipeline.
 *
 * Flow:
 * 1. Soniox transcribes voice note → text
 * 2. Completeness check: does the transcript contain enough info (brand, size, condition, price)?
 *    - Complete → text-only model call (cheaper, faster)
 *    - Incomplete → text + images sent to vision model
 * 3. Structured output: single model call returns canonical listing JSON
 *
 * STT provider: Soniox REST API (SONIOX_API_KEY)
 * Generation provider: Vercel AI Gateway (prefer AI_GATEWAY_API_KEY, fallback to VERCEL_OIDC_TOKEN) → minimax/minimax-m2.7
 */

import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { CANONICAL_CATEGORY_KEYS, normalizeCategoryForStorage } from "./categories";

// ─── Vercel AI Gateway client ─────────────────────────────────────────────────

function getGatewayClient() {
  // Preferred: explicit AI Gateway API key configured in Vercel env vars.
  // Fallback: Vercel-issued OIDC token if available in the runtime.
  const apiKey = process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_OIDC_TOKEN;
  if (!apiKey) {
    throw new Error("AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN is required");
  }

  return createOpenAI({
    baseURL: "https://ai-gateway.vercel.sh/v1",
    apiKey,
  });
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ListingSchema = z.object({
  title: z.string().describe("Short, keyword-rich listing title (max 70 chars). Platform-optimized for search."),
  description: z.string().describe("Detailed item description including condition notes, measurements, and any flaws."),
  price: z.number().positive().describe("Listing price in USD"),
  size: z.string().nullable().describe("Size (e.g. 'M', 'L', '32x30', 'one size'). null if not applicable."),
  condition: z.enum(["new", "gently_used", "used", "heavily_used"]).describe("Item condition"),
  brand: z.string().nullable().describe("Brand name (e.g. 'Nike', 'Levi\\'s'). null if unknown."),
  category: z.enum(CANONICAL_CATEGORY_KEYS).describe(
    "Canonical supported category key. Choose only from the provided enum. If the item is not supported by our marketplaces, use unsupported.other."
  ),
  traits: z.record(z.string()).describe(
    "Additional attributes as key-value pairs. Always include traits.color when identifiable (for example black, white, blue, red, green, silver, gold, brown, grey, navy, orange, pink, purple, yellow, multi, cream). Include traits.country_of_origin only when known."
  ),
});

type GeneratedListing = z.infer<typeof ListingSchema>;

// ─── Completeness check ───────────────────────────────────────────────────────

const COMPLETENESS_KEYWORDS = {
  brand: /\b(nike|adidas|supreme|levi|ralph lauren|gucci|prada|zara|h&m|uniqlo|gap|vintage|brand)\b/i,
  size: /\b(xs|small|medium|large|xl|xxl|s|m|l|\d{2}x\d{2}|one size|os|\d+ inch|\d+cm)\b/i,
  condition: /\b(new|nwt|brand new|gently used|used|worn|good condition|great condition|excellent|fair|heavily)\b/i,
  price: /\$?\d+(\.\d{2})?/,
};

function isTranscriptComplete(transcript: string): boolean {
  const checks = Object.values(COMPLETENESS_KEYWORDS);
  const passing = checks.filter((pattern) => pattern.test(transcript));
  // Require at least 3/4 signals to skip vision
  return passing.length >= 3;
}

// ─── Soniox transcription ────────────────────────────────────────────────────

type SonioxFileResponse = {
  id: string;
  filename: string;
};

type SonioxTranscriptionStatus = "queued" | "processing" | "completed" | "failed";

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

  for (let attempt = 0; attempt < SONIOX_MAX_POLL_ATTEMPTS && transcription.status !== "completed"; attempt++) {
    if (transcription.status === "failed") {
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
  return transcript.text.trim();
}

// ─── Listing generation ───────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert reseller who creates optimized marketplace listings.
Given a voice description and optionally photos, generate a complete, accurate listing.
- Titles should be keyword-rich and under 70 characters
- Descriptions should be detailed, mention condition, measurements, and any flaws
- Be accurate — do not invent details not mentioned or visible
- Prices should be reasonable resale values unless specified by the seller
- For condition: "new" = unworn/unused with tags, "gently_used" = minimal wear, "used" = visible wear, "heavily_used" = significant wear/flaws
- Category must be one of the canonical supported category enum values
- If the item is outside our supported fashion/accessory categories, set category to unsupported.other
- In traits, include color whenever it can be inferred from the text or photos
- Prefer marketplace-safe trait keys such as color and country_of_origin`;

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

function normalizeGeneratedListing(listing: GeneratedListing, transcript: string) {
  const traits = { ...(listing.traits ?? {}) };
  const inferredColor = typeof traits.color === "string" && traits.color.trim()
    ? traits.color.trim().toLowerCase()
    : inferColorFromText(listing.title, listing.description, listing.category, transcript);
  const category = normalizeCategoryForStorage(listing.category);

  if (inferredColor) {
    traits.color = inferredColor;
  }

  return {
    ...listing,
    category,
    traits,
  };
}

async function generateWithText(transcript: string): Promise<GeneratedListing> {
  const client = getGatewayClient();

  const { object } = await generateObject({
    model: client("minimax/minimax-m2.7"),
    schema: ListingSchema,
    system: SYSTEM_PROMPT,
    prompt: `Create a marketplace listing based on this voice description:\n\n"${transcript}"`,
  });

  return object;
}

async function generateWithVision(transcript: string, photoUrls: string[]): Promise<GeneratedListing> {
  const client = getGatewayClient();

  const imageContent = photoUrls.slice(0, 4).map((url) => ({
    type: "image" as const,
    image: url,
  }));

  const { object } = await generateObject({
    model: client("minimax/minimax-m2.7"),
    schema: ListingSchema,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          ...imageContent,
          {
            type: "text",
            text: `Create a marketplace listing. Voice description: "${transcript || "No voice description provided."}"`,
          },
        ],
      },
    ],
  });

  return object;
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
    model: client("minimax/minimax-m2.7"),
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
  const { audioBuffer, audioMimeType, photoUrls, transcript: providedTranscript } = input;

  // Step 1: Determine transcript.
  // If a transcript is explicitly provided, prefer it and skip STT so manual
  // testing can exercise generation without Soniox cost/latency.
  let transcript = providedTranscript?.trim() ?? "";
  if (!transcript && audioBuffer && audioMimeType) {
    transcript = await transcribeAudio(audioBuffer, audioMimeType);
    console.log(JSON.stringify({ event: "ai.transcription_complete", transcript_length: transcript.length }));
  } else if (transcript) {
    console.log(JSON.stringify({ event: "ai.transcript_provided", transcript_length: transcript.length }));
  }

  // Step 2: Decide text-only vs vision
  const complete = isTranscriptComplete(transcript);
  const useVision = !complete && photoUrls.length > 0;

  console.log(JSON.stringify({ event: "ai.completeness_check", complete, useVision, transcript_length: transcript.length }));

  // Step 3: Generate listing
  const startMs = Date.now();
  const listing = useVision
    ? await generateWithVision(transcript, photoUrls)
    : await generateWithText(transcript);
  const latencyMs = Date.now() - startMs;
  const normalizedListing = normalizeGeneratedListing(listing, transcript);

  console.log(JSON.stringify({ event: "ai.generation_complete", latency_ms: latencyMs, used_vision: useVision }));

  return {
    listing: normalizedListing,
    voiceTranscript: transcript || null,
    aiRawResponse: { listing: normalizedListing, usedVision: useVision, transcript },
    usedVision: useVision,
  };
}
