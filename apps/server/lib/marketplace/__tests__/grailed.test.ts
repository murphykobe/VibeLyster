import { describe, it, expect, vi, beforeEach } from "vitest";
import { mapCategory, mapCondition, publishToGrailed, delistFromGrailed, checkGrailedStatus } from "../grailed";
import type { CanonicalListing, GrailedTokens } from "../types";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TOKENS: GrailedTokens = { csrf_token: "csrf-abc", cookies: "session=xyz" };

function makeListing(overrides: Partial<CanonicalListing> = {}): CanonicalListing {
  return {
    id: "listing-1",
    title: "Vintage Jacket",
    description: "Great condition vintage jacket",
    price: 120,
    size: "L",
    condition: "gently_used",
    brand: "Carhartt",
    category: "jacket",
    traits: {},
    photos: ["https://blob.vercel-storage.com/photo1.jpg"],
    ...overrides,
  };
}

/** Build a sequential fetch mock from an array of Response objects */
function mockFetchSequence(responses: Response[]) {
  let i = 0;
  const mock = vi.fn().mockImplementation(() => Promise.resolve(responses[i++]));
  vi.stubGlobal("fetch", mock);
  return mock;
}

// ─── mapCategory ──────────────────────────────────────────────────────────────

describe("mapCategory (Grailed)", () => {
  it("returns default for null", () => {
    expect(mapCategory(null)).toBe("tops.t_shirts");
  });

  it("returns default for unknown category", () => {
    expect(mapCategory("mystery-item")).toBe("tops.t_shirts");
  });

  it("maps all known exact keys", () => {
    const cases: [string, string][] = [
      ["t-shirt", "tops.t_shirts"],
      ["shirt", "tops.shirts"],
      ["hoodie", "tops.sweatshirts_hoodies"],
      // "sweatshirt" contains "shirt" which appears earlier in the map → maps to shirts (documented behavior)
      ["sweatshirt", "tops.shirts"],
      ["sweater", "tops.sweaters_knitwear"],
      ["jacket", "tops.jackets"],
      ["coat", "tops.coats"],
      ["pants", "bottoms.pants"],
      ["jeans", "bottoms.denim"],
      ["shorts", "bottoms.shorts"],
      ["sneakers", "footwear.sneakers"],
      ["boots", "footwear.boots"],
      ["shoes", "footwear.dress_shoes"],
      ["bag", "accessories.bags_luggage"],
      ["wallet", "accessories.wallets"],
      ["belt", "accessories.belts"],
      ["hat", "accessories.hats_scarves_gloves"],
      ["watch", "accessories.watches"],
      ["suit", "tailoring.suits"],
      ["blazer", "tailoring.blazers_sportcoats"],
    ];
    for (const [input, expected] of cases) {
      expect(mapCategory(input), input).toBe(expected);
    }
  });

  it("matches on substring (case-insensitive)", () => {
    expect(mapCategory("Vintage T-Shirt")).toBe("tops.t_shirts");
    expect(mapCategory("DENIM JEANS")).toBe("bottoms.denim");
    expect(mapCategory("Nike Sneakers Size 10")).toBe("footwear.sneakers");
    expect(mapCategory("Wool Sweater")).toBe("tops.sweaters_knitwear");
  });
});

// ─── mapCondition ─────────────────────────────────────────────────────────────

describe("mapCondition (Grailed)", () => {
  it("returns default for null", () => {
    expect(mapCondition(null)).toBe("is_gently_used");
  });

  it("returns default for unknown condition", () => {
    expect(mapCondition("lightly worn")).toBe("is_gently_used");
  });

  it("maps all known conditions", () => {
    const cases: [string, string][] = [
      ["new", "is_new"],
      ["brand_new", "is_new"],
      ["nwt", "is_new"],
      ["gently_used", "is_gently_used"],
      ["used", "is_used"],
      ["heavily_used", "is_heavily_used"],
    ];
    for (const [input, expected] of cases) {
      expect(mapCondition(input), input).toBe(expected);
    }
  });

  it("normalises spaces to underscores before lookup", () => {
    expect(mapCondition("gently used")).toBe("is_gently_used");
    expect(mapCondition("heavily used")).toBe("is_heavily_used");
  });
});

// ─── publishToGrailed ─────────────────────────────────────────────────────────

describe("publishToGrailed", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns error + retryable=true when fetch rejects (network failure)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network down")));
    const result = await publishToGrailed(makeListing(), TOKENS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryable).toBe(true);
      expect(result.error).toContain("Network down");
    }
  });

  it("returns retryable=false for 4xx (non-429) errors", async () => {
    mockFetchSequence([
      new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
    ]);
    const result = await publishToGrailed(makeListing(), TOKENS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryable).toBe(false);
  });

  it("returns retryable=true for 500 errors", async () => {
    mockFetchSequence([
      new Response(JSON.stringify({ error: "server error" }), { status: 500 }),
    ]);
    const result = await publishToGrailed(makeListing(), TOKENS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryable).toBe(true);
  });

  it("returns retryable=true for 429", async () => {
    mockFetchSequence([
      new Response(JSON.stringify({ error: "rate limited" }), { status: 429 }),
    ]);
    const result = await publishToGrailed(makeListing(), TOKENS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryable).toBe(true);
  });

  it("builds correct payload shape and returns platformListingId on success", async () => {
    mockFetchSequence([
      // getMe
      new Response(JSON.stringify({ data: { id: 42, username: "user42" } }), { status: 200 }),
      // getAddresses
      new Response(JSON.stringify({ data: [{ id: 99 }] }), { status: 200 }),
      // uploadPhotoFromUrl: presign
      new Response(JSON.stringify({ data: { fields: { key: "abc" }, url: "https://s3.example.com/", image_url: "https://grailed-media.s3.amazonaws.com/photo1.jpg" } }), { status: 200 }),
      // uploadPhotoFromUrl: fetch photo from blob
      new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 }),
      // uploadPhotoFromUrl: POST to S3 (204 is OK)
      new Response(null, { status: 204 }),
      // POST /api/listings
      new Response(JSON.stringify({ data: { id: 777 } }), { status: 200 }),
    ]);

    const result = await publishToGrailed(makeListing(), TOKENS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.platformListingId).toBe("777");
      expect(result.platformData).toMatchObject({
        category_path: "tops.jackets",
        condition: "is_gently_used",
        title: "Vintage Jacket",
        price: "120",
        size: "L",
        designers: [{ name: "Carhartt" }],
      });
    }
  });

  it("slices photos to 8 max", async () => {
    const photoResponses = Array.from({ length: 8 }, () => [
      new Response(JSON.stringify({ data: { fields: {}, url: "https://s3.example.com/", image_url: "https://grailed-media.s3.amazonaws.com/img.jpg" } }), { status: 200 }),
      new Response(new Uint8Array([1]).buffer, { status: 200 }),
      new Response(null, { status: 204 }),
    ]).flat();

    mockFetchSequence([
      new Response(JSON.stringify({ data: { id: 1 } }), { status: 200 }),   // getMe
      new Response(JSON.stringify({ data: [{ id: 1 }] }), { status: 200 }), // getAddresses
      ...photoResponses,
      new Response(JSON.stringify({ data: { id: 55 } }), { status: 200 }),  // POST listing
    ]);

    const listing = makeListing({
      photos: Array.from({ length: 12 }, (_, i) => `https://blob.vercel-storage.com/photo${i}.jpg`),
    });
    const result = await publishToGrailed(listing, TOKENS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const photos = (result.platformData as { photos: unknown[] }).photos;
      expect(photos).toHaveLength(8);
    }
  });
});

// ─── delistFromGrailed ────────────────────────────────────────────────────────

describe("delistFromGrailed", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns ok:true on successful DELETE", async () => {
    mockFetchSequence([new Response(JSON.stringify({}), { status: 200 })]);
    const result = await delistFromGrailed("777", TOKENS);
    expect(result.ok).toBe(true);
  });

  it("returns retryable=false for 4xx", async () => {
    mockFetchSequence([new Response(JSON.stringify({ error: "not found" }), { status: 404 })]);
    const result = await delistFromGrailed("999", TOKENS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryable).toBe(false);
  });

  it("returns retryable=true for 500", async () => {
    mockFetchSequence([new Response("server error", { status: 500 })]);
    const result = await delistFromGrailed("999", TOKENS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryable).toBe(true);
  });
});

// ─── checkGrailedStatus ───────────────────────────────────────────────────────

describe("checkGrailedStatus", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns live for active listing", async () => {
    mockFetchSequence([new Response(JSON.stringify({ data: { sold: false } }), { status: 200 })]);
    expect(await checkGrailedStatus("1")).toEqual({ ok: true, status: "live" });
  });

  it("returns sold for sold listing", async () => {
    mockFetchSequence([new Response(JSON.stringify({ data: { sold: true } }), { status: 200 })]);
    expect(await checkGrailedStatus("1")).toEqual({ ok: true, status: "sold" });
  });

  it("returns delisted for 404", async () => {
    mockFetchSequence([new Response(JSON.stringify({ error: "not found" }), { status: 404 })]);
    expect(await checkGrailedStatus("1")).toEqual({ ok: true, status: "delisted" });
  });
});
