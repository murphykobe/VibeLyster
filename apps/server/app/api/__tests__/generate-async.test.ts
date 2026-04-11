import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  afterCallbacks: [] as Array<() => void | Promise<void>>,
  createListing: vi.fn(),
  updateListingGeneration: vi.fn(),
  generateListing: vi.fn(),
  requireAuth: vi.fn(),
}));

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: (callback: () => void | Promise<void>) => {
      mocks.afterCallbacks.push(callback);
    },
  };
});

vi.mock("@/lib/auth", () => ({
  requireAuth: mocks.requireAuth,
  AuthError: class AuthError extends Error {},
  authErrorResponse: () => Response.json({ error: "auth" }, { status: 401 }),
}));

vi.mock("@/lib/mock", () => ({
  isMockMode: () => false,
}));

vi.mock("@/lib/db", () => ({
  createListing: mocks.createListing,
  updateListingGeneration: mocks.updateListingGeneration,
}));

vi.mock("@/lib/ai", () => ({
  generateListing: mocks.generateListing,
}));

import { NextRequest } from "next/server";
import { POST } from "../generate/route";

describe("POST /api/generate async flow", () => {
  beforeEach(() => {
    mocks.afterCallbacks.length = 0;
    mocks.createListing.mockReset();
    mocks.updateListingGeneration.mockReset();
    mocks.generateListing.mockReset();
    mocks.requireAuth.mockReset();
    mocks.requireAuth.mockResolvedValue({ id: "user-1" });
    mocks.updateListingGeneration.mockResolvedValue(undefined);
  });

  it("returns a generating placeholder immediately and completes generation in the background", async () => {
    mocks.createListing.mockResolvedValue({
      id: "listing-1",
      user_id: "user-1",
      title: null,
      description: null,
      price: null,
      size: null,
      condition: null,
      brand: null,
      category: null,
      traits: {},
      photos: ["https://example.com/photo.jpg"],
      voice_transcript: null,
      ai_raw_response: null,
      generation_status: "generating",
      generation_error: null,
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    mocks.generateListing.mockResolvedValue({
      listing: {
        title: "Test title",
        description: "Test description",
        price: 120,
        size: { system: "CLOTHING_LETTER", value: "M" },
        condition: "gently_used",
        brand: "Nike",
        category: "tops.t_shirt",
        traits: { color: "black" },
      },
      voiceTranscript: "black nike tee size medium",
      aiRawResponse: { ok: true },
      usedVision: false,
    });

    const form = new FormData();
    form.append("photos", "https://example.com/photo.jpg");
    form.append("transcript", "black nike tee size medium");

    const res = await POST(new NextRequest("http://localhost/api/generate", { method: "POST", body: form }));

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.listing.id).toBe("listing-1");
    expect(data.listing.generation_status).toBe("generating");
    expect(mocks.createListing).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      title: null,
      description: null,
      price: null,
      photos: ["https://example.com/photo.jpg"],
      generation_status: "generating",
    }));
    expect(mocks.afterCallbacks).toHaveLength(1);
    expect(mocks.updateListingGeneration).not.toHaveBeenCalled();

    await mocks.afterCallbacks[0]!();

    expect(mocks.generateListing).toHaveBeenCalledWith({
      audioBuffer: undefined,
      audioMimeType: undefined,
      photoUrls: ["https://example.com/photo.jpg"],
      transcript: "black nike tee size medium",
    });
    expect(mocks.updateListingGeneration).toHaveBeenCalledWith("listing-1", expect.objectContaining({
      generation_status: "complete",
      generation_error: null,
      title: "Test title",
      size: JSON.stringify({ system: "CLOTHING_LETTER", value: "M" }),
    }));
  });

  it("marks the placeholder listing as failed when background generation throws", async () => {
    mocks.createListing.mockResolvedValue({
      id: "listing-2",
      generation_status: "generating",
    });
    mocks.generateListing.mockRejectedValue(new Error("model exploded"));

    const form = new FormData();
    form.append("transcript", "black nike tee size medium");

    const res = await POST(new NextRequest("http://localhost/api/generate", { method: "POST", body: form }));

    expect(res.status).toBe(201);
    expect(mocks.afterCallbacks).toHaveLength(1);

    await mocks.afterCallbacks[0]!();

    expect(mocks.updateListingGeneration).toHaveBeenCalledWith("listing-2", {
      generation_status: "failed",
      generation_error: "model exploded",
    });
  });
});
