import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getListingGenerationModelId, getVisionFallbackFields, inferExplicitAcceptOffersFromTranscript, normalizeGeneratedSizeForTest, shouldUseVisionFallback, transcribeAudio } from "../ai";

describe("getListingGenerationModelId", () => {
  it("uses the current text model for transcript-only generation", () => {
    expect(getListingGenerationModelId({ useVision: false })).toBe("google/gemini-2.5-flash");
  });

  it("uses the current vision-capable model for image generation", () => {
    expect(getListingGenerationModelId({ useVision: true })).toBe("google/gemini-2.5-flash");
  });
});

describe("structured size normalization", () => {
  it("accepts a structured clothing size with a valid system even when the value is not in the suggestion list", () => {
    expect(normalizeGeneratedSizeForTest(
      { system: "CLOTHING_LETTER", value: "MEDIUM" },
      "tops.t_shirt",
    )).toEqual({ system: "CLOTHING_LETTER", value: "MEDIUM" });
  });

  it("translates eu clothing sizes into canonical letter sizes for tops", () => {
    expect(normalizeGeneratedSizeForTest(
      { system: "EU_CLOTHING", value: "48" },
      "tops.t_shirt",
    )).toEqual({ system: "CLOTHING_LETTER", value: "M" });
  });

  it("translates italian clothing sizes into canonical letter sizes for outerwear", () => {
    expect(normalizeGeneratedSizeForTest(
      { system: "IT_CLOTHING", value: "48" },
      "outerwear.jacket",
    )).toEqual({ system: "CLOTHING_LETTER", value: "M" });
  });

  it("translates us clothing sizes into canonical letter sizes for tops", () => {
    expect(normalizeGeneratedSizeForTest(
      { system: "US_CLOTHING", value: "38" },
      "tops.t_shirt",
    )).toEqual({ system: "CLOTHING_LETTER", value: "M" });
  });

  it("translates jp clothing sizes into canonical letter sizes for tops", () => {
    expect(normalizeGeneratedSizeForTest(
      { system: "JP_CLOTHING", value: "2" },
      "tops.t_shirt",
    )).toEqual({ system: "CLOTHING_LETTER", value: "M" });
  });

  it("does not collapse bottom waist sizes into top letter sizes", () => {
    expect(normalizeGeneratedSizeForTest(
      { system: "PANTS_WAIST", value: "32" },
      "bottoms.jeans",
    )).toEqual({ system: "PANTS_WAIST", value: "32" });
  });

  it("rejects a size system that is not allowed for the category group", () => {
    expect(normalizeGeneratedSizeForTest(
      { system: "US_MENS_SHOE", value: "10" },
      "tops.t_shirt",
    )).toBeNull();
  });

  it("normalizes one size casing for structured values", () => {
    expect(normalizeGeneratedSizeForTest(
      { system: "ONE_SIZE", value: "one size" },
      "accessories.belt",
    )).toEqual({ system: "ONE_SIZE", value: "ONE SIZE" });
  });
});

describe("accept offers inference", () => {
  it("returns true when the transcript explicitly invites offers", () => {
    expect(inferExplicitAcceptOffersFromTranscript("price is 350 and I am open to offers")).toBe(true);
    expect(inferExplicitAcceptOffersFromTranscript("offers welcome but no trades")).toBe(true);
  });

  it("returns false when offers are not explicitly mentioned", () => {
    expect(inferExplicitAcceptOffersFromTranscript("navy supreme box logo hoodie size large")).toBe(false);
  });
});

describe("vision fallback routing", () => {
  it("returns unresolved image-derivable fields that should trigger vision", () => {
    expect(
      getVisionFallbackFields({
        unresolvedFields: ["brand", "price"],
        lowConfidenceFields: ["condition"],
      })
    ).toEqual(["brand", "condition"]);
  });

  it("triggers vision fallback when photos exist and image-derivable fields are unresolved", () => {
    expect(
      shouldUseVisionFallback({
        photoUrls: ["https://example.com/shirt.jpg"],
        unresolvedFields: ["brand"],
        lowConfidenceFields: [],
      })
    ).toBe(true);
  });

  it("does not trigger vision fallback when only non-image-derivable fields are unresolved", () => {
    expect(
      shouldUseVisionFallback({
        photoUrls: ["https://example.com/shirt.jpg"],
        unresolvedFields: ["price"],
        lowConfidenceFields: [],
      })
    ).toBe(false);
  });

  it("does not trigger vision fallback without photos", () => {
    expect(
      shouldUseVisionFallback({
        photoUrls: [],
        unresolvedFields: ["brand", "category"],
        lowConfidenceFields: [],
      })
    ).toBe(false);
  });
});

describe("transcribeAudio", () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.SONIOX_API_KEY;

  beforeEach(() => {
    process.env.SONIOX_API_KEY = "soniox-test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.SONIOX_API_KEY;
    } else {
      process.env.SONIOX_API_KEY = originalApiKey;
    }
    vi.restoreAllMocks();
  });

  it("uploads audio, creates an async transcription, polls until completed, and returns transcript text", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "file-123", filename: "voice.m4a", size: 4, created_at: "2026-04-05T00:00:00Z" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "tx-123", status: "queued", model: "stt-async-v4", filename: "voice.m4a", created_at: "2026-04-05T00:00:00Z", enable_speaker_diarization: false, enable_language_identification: false }), {
          status: 201,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "tx-123", status: "processing", model: "stt-async-v4", filename: "voice.m4a", created_at: "2026-04-05T00:00:00Z", enable_speaker_diarization: false, enable_language_identification: false }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "tx-123", status: "completed", model: "stt-async-v4", filename: "voice.m4a", created_at: "2026-04-05T00:00:00Z", enable_speaker_diarization: false, enable_language_identification: false }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "tx-123", text: "hello world" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        })
      );

    global.fetch = fetchMock as typeof fetch;

    const transcript = await transcribeAudio(new TextEncoder().encode("test-audio").buffer, "audio/m4a");

    expect(transcript).toBe("hello world");
    expect(fetchMock).toHaveBeenCalledTimes(5);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.soniox.com/v1/files",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer soniox-test-key" },
        body: expect.any(FormData),
      })
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.soniox.com/v1/transcriptions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer soniox-test-key",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ model: "stt-async-v4", file_id: "file-123" }),
      })
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://api.soniox.com/v1/transcriptions/tx-123",
      expect.objectContaining({
        headers: { Authorization: "Bearer soniox-test-key" },
      })
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "https://api.soniox.com/v1/transcriptions/tx-123",
      expect.objectContaining({
        headers: { Authorization: "Bearer soniox-test-key" },
      })
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      "https://api.soniox.com/v1/transcriptions/tx-123/transcript",
      expect.objectContaining({
        headers: { Authorization: "Bearer soniox-test-key" },
      })
    );
  });
});
