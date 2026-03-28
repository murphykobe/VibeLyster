/**
 * AI generation pipeline.
 *
 * Flow:
 * 1. Whisper transcribes voice note → text
 * 2. Completeness check: does the transcript contain enough info (brand, size, condition, price)?
 *    - Complete → text-only model call (cheaper, faster)
 *    - Incomplete → text + images sent to vision model
 * 3. Structured output: single model call returns canonical listing JSON
 *
 * Provider: Vercel AI Gateway (OIDC auth, provider-agnostic routing)
 * Models: openai/whisper-1 for transcription, claude-sonnet-4-6 for generation
 */

import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

// ─── Vercel AI Gateway client ─────────────────────────────────────────────────

function getGatewayClient() {
  // In production (Vercel), VERCEL_OIDC_TOKEN is auto-injected.
  // For local dev, run `vercel env pull` to get it in .env.local.
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  if (!oidcToken) throw new Error("VERCEL_OIDC_TOKEN is required");

  return createOpenAI({
    baseURL: "https://ai-gateway.vercel.sh/v1",
    apiKey: oidcToken,
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
  category: z.string().nullable().describe("Item category (e.g. 't-shirt', 'jeans', 'sneakers', 'jacket', 'bag'). Use lowercase singular."),
  traits: z.record(z.string()).describe("Additional attributes as key-value pairs (e.g. {color: 'black', material: 'denim'})"),
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

// ─── Whisper transcription ────────────────────────────────────────────────────

export async function transcribeAudio(audioBuffer: ArrayBuffer, mimeType: string): Promise<string> {
  const oidcToken = process.env.VERCEL_OIDC_TOKEN;
  if (!oidcToken) throw new Error("VERCEL_OIDC_TOKEN is required");

  const form = new FormData();
  const blob = new Blob([audioBuffer], { type: mimeType });
  form.append("file", blob, "voice.m4a");
  form.append("model", "openai/whisper-1");

  const res = await fetch("https://ai-gateway.vercel.sh/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${oidcToken}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Whisper transcription failed ${res.status}: ${text}`);
  }

  const data = await res.json() as { text: string };
  return data.text;
}

// ─── Listing generation ───────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert reseller who creates optimized marketplace listings.
Given a voice description and optionally photos, generate a complete, accurate listing.
- Titles should be keyword-rich and under 70 characters
- Descriptions should be detailed, mention condition, measurements, and any flaws
- Be accurate — do not invent details not mentioned or visible
- Prices should be reasonable resale values unless specified by the seller
- For condition: "new" = unworn/unused with tags, "gently_used" = minimal wear, "used" = visible wear, "heavily_used" = significant wear/flaws`;

async function generateWithText(transcript: string): Promise<GeneratedListing> {
  const client = getGatewayClient();

  const { object } = await generateObject({
    model: client("anthropic/claude-sonnet-4-6"),
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
    model: client("anthropic/claude-sonnet-4-6"),
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
};

export type GenerateListingResult = {
  listing: GeneratedListing;
  voiceTranscript: string | null;
  aiRawResponse: Record<string, unknown>;
  usedVision: boolean;
};

export async function generateListing(input: GenerateListingInput): Promise<GenerateListingResult> {
  const { audioBuffer, audioMimeType, photoUrls } = input;

  // Step 1: Transcribe audio (if provided)
  let transcript = "";
  if (audioBuffer && audioMimeType) {
    transcript = await transcribeAudio(audioBuffer, audioMimeType);
    console.log(JSON.stringify({ event: "ai.transcription_complete", transcript_length: transcript.length }));
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

  console.log(JSON.stringify({ event: "ai.generation_complete", latency_ms: latencyMs, used_vision: useVision }));

  return {
    listing,
    voiceTranscript: transcript || null,
    aiRawResponse: { listing, usedVision: useVision, transcript },
    usedVision: useVision,
  };
}
