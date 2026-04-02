import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock impit so its fetch method always delegates to globalThis.fetch.
// This prevents the module-level impitFetch cache from capturing a stale reference
// when vi.stubGlobal replaces globalThis.fetch between tests.
vi.mock("impit", () => ({
  Impit: class {
    fetch(input: RequestInfo | URL, init?: RequestInit) {
      return globalThis.fetch(input, init);
    }
  },
}));

import { mapCategory, mapCondition, publishToDepop, delistFromDepop, checkDepopStatus } from "../depop";
import type { CanonicalListing, DepopTokens } from "../types";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TOKENS: DepopTokens = { access_token: "bearer-token-abc" };

function makeListing(overrides: Partial<CanonicalListing> = {}): CanonicalListing {
  return {
    id: "listing-1",
    title: "Vintage Hoodie",
    description: "Cool vintage hoodie",
    price: 85,
    size: "M",
    condition: "used",
    brand: "Champion",
    category: "tops.hoodie",
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

describe("mapCategory (Depop)", () => {
  it("returns default for null", () => {
    expect(mapCategory(null)).toEqual({ group: "clothing", productType: "t-shirts" });
  });

  it("returns default for unknown category", () => {
    expect(mapCategory("mystery-item")).toEqual({ group: "clothing", productType: "t-shirts" });
  });

  it("maps all known exact keys", () => {
    const cases: [string, { group: string; productType: string }][] = [
      ["t-shirt", { group: "clothing", productType: "t-shirts" }],
      ["shirt", { group: "clothing", productType: "shirts" }],
      ["hoodie", { group: "clothing", productType: "sweatshirts-hoodies" }],
      ["sweatshirt", { group: "clothing", productType: "sweatshirts-hoodies" }],
      ["sweater", { group: "clothing", productType: "knitwear" }],
      ["jacket", { group: "clothing", productType: "coats-jackets" }],
      ["coat", { group: "clothing", productType: "coats-jackets" }],
      ["pants", { group: "clothing", productType: "trousers" }],
      ["jeans", { group: "clothing", productType: "jeans" }],
      ["shorts", { group: "clothing", productType: "shorts" }],
      ["sneakers", { group: "shoes", productType: "trainers" }],
      ["boots", { group: "shoes", productType: "boots" }],
      ["shoes", { group: "shoes", productType: "shoes" }],
      ["bag", { group: "bags", productType: "bags" }],
      ["wallet", { group: "accessories", productType: "wallet-purses" }],
      ["belt", { group: "accessories", productType: "belts" }],
      ["hat", { group: "accessories", productType: "hats" }],
      ["watch", { group: "accessories", productType: "watches" }],
    ];
    for (const [input, expected] of cases) {
      expect(mapCategory(input), input).toEqual(expected);
    }
  });

  it("maps canonical category keys directly", () => {
    expect(mapCategory("tops.hoodie")).toEqual({ group: "clothing", productType: "sweatshirts-hoodies" });
    expect(mapCategory("footwear.sneakers")).toEqual({ group: "shoes", productType: "trainers" });
  });

  it("matches on substring (case-insensitive)", () => {
    expect(mapCategory("Vintage Hoodie")).toEqual({ group: "clothing", productType: "sweatshirts-hoodies" });
    expect(mapCategory("HIGH TOP SNEAKERS")).toEqual({ group: "shoes", productType: "trainers" });
    expect(mapCategory("Leather Jacket Size L")).toEqual({ group: "clothing", productType: "coats-jackets" });
    expect(mapCategory("Denim Jeans")).toEqual({ group: "clothing", productType: "jeans" });
  });
});

// ─── mapCondition ─────────────────────────────────────────────────────────────

describe("mapCondition (Depop)", () => {
  it("returns default for null", () => {
    expect(mapCondition(null)).toBe("excellent_condition");
  });

  it("returns default for unknown condition", () => {
    expect(mapCondition("lightly worn")).toBe("excellent_condition");
  });

  it("maps all known conditions", () => {
    const cases: [string, string][] = [
      ["new", "brand_new"],
      ["brand_new", "brand_new"],
      ["nwt", "brand_new"],
      ["gently_used", "excellent_condition"],
      ["used", "good_condition"],
      ["heavily_used", "fair_condition"],
    ];
    for (const [input, expected] of cases) {
      expect(mapCondition(input), input).toBe(expected);
    }
  });
});

// ─── publishToDepop ───────────────────────────────────────────────────────────

describe("publishToDepop", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns error + retryable=true when fetch rejects (network failure)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network down")));
    const result = await publishToDepop(makeListing(), TOKENS);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryable).toBe(true);
      expect(result.error).toContain("Network down");
    }
  });

  it("returns retryable=false for 4xx (non-429) errors", async () => {
    mockFetchSequence([
      new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
    ]);
    const result = await publishToDepop(makeListing(), TOKENS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryable).toBe(false);
  });

  it("returns retryable=true for 500 errors", async () => {
    mockFetchSequence([
      new Response(JSON.stringify({ error: "server error" }), { status: 500 }),
    ]);
    const result = await publishToDepop(makeListing(), TOKENS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryable).toBe(true);
  });

  it("returns retryable=true for 429", async () => {
    mockFetchSequence([
      new Response(JSON.stringify({ error: "rate limited" }), { status: 429 }),
    ]);
    const result = await publishToDepop(makeListing(), TOKENS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryable).toBe(true);
  });

  it("builds correct payload shape and returns platformListingId on success", async () => {
    mockFetchSequence([
      // resolveUserId (GET /api/v1/addresses/)
      new Response(JSON.stringify([{ userId: "user-42", id: 7 }]), { status: 200 }),
      // getShipFromAddress (GET /api/v1/addresses/) — same endpoint, same response
      new Response(JSON.stringify([{ userId: "user-42", id: 7 }]), { status: 200 }),
      // uploadPhotoFromUrl: POST /api/v2/pictures/ (presign)
      new Response(JSON.stringify({ id: 100, url: "https://s3.depop.com/presigned" }), { status: 200 }),
      // uploadPhotoFromUrl: fetch photo from blob (native fetch, not impit)
      new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 }),
      // uploadPhotoFromUrl: PUT to S3
      new Response(null, { status: 200 }),
      // POST /api/v2/drafts/
      new Response(JSON.stringify({ id: 500 }), { status: 200 }),
      // PUT /api/v2/drafts/:id
      new Response(JSON.stringify({ id: 500 }), { status: 200 }),
      // PUT /api/v2/products/:id
      new Response(JSON.stringify({ id: 500 }), { status: 200 }),
    ]);

    const result = await publishToDepop(makeListing(), TOKENS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.platformListingId).toBe("500");
      expect(result.platformData).toMatchObject({
        group: "clothing",
        productType: "sweatshirts-hoodies",
        condition: "good_condition",
        priceAmount: "85.00",
        priceCurrency: "USD",
        quantity: 1,
      });
    }
  });

  it("formats price to 2 decimal places", async () => {
    mockFetchSequence([
      new Response(JSON.stringify([{ userId: "u1", id: 1 }]), { status: 200 }),
      new Response(JSON.stringify([{ userId: "u1", id: 1 }]), { status: 200 }),
      new Response(JSON.stringify({ id: 10, url: "https://s3.depop.com/presigned" }), { status: 200 }),
      new Response(new Uint8Array([1]).buffer, { status: 200 }),
      new Response(null, { status: 200 }),
      new Response(JSON.stringify({ id: 200 }), { status: 200 }),
      new Response(JSON.stringify({ id: 200 }), { status: 200 }),
      new Response(JSON.stringify({ id: 200 }), { status: 200 }),
    ]);

    const result = await publishToDepop(makeListing({ price: 9.9 }), TOKENS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.platformData as { priceAmount: string }).priceAmount).toBe("9.90");
    }
  });

  it("slices photos to 4 max", async () => {
    const photoResponses = Array.from({ length: 4 }, (_, i) => [
      new Response(JSON.stringify({ id: i + 10, url: "https://s3.depop.com/presigned" }), { status: 200 }),
      new Response(new Uint8Array([1]).buffer, { status: 200 }),
      new Response(null, { status: 200 }),
    ]).flat();

    mockFetchSequence([
      new Response(JSON.stringify([{ userId: "u1", id: 1 }]), { status: 200 }),
      new Response(JSON.stringify([{ userId: "u1", id: 1 }]), { status: 200 }),
      ...photoResponses,
      new Response(JSON.stringify({ id: 300 }), { status: 200 }),
      new Response(JSON.stringify({ id: 300 }), { status: 200 }),
      new Response(JSON.stringify({ id: 300 }), { status: 200 }),
    ]);

    const listing = makeListing({
      photos: Array.from({ length: 6 }, (_, i) => `https://blob.vercel-storage.com/photo${i}.jpg`),
    });
    const result = await publishToDepop(listing, TOKENS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const pictures = (result.platformData as { pictures: unknown[] }).pictures;
      expect(pictures).toHaveLength(4);
    }
  });
});

// ─── delistFromDepop ──────────────────────────────────────────────────────────

describe("delistFromDepop", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns ok:true on successful DELETE (204)", async () => {
    mockFetchSequence([new Response(null, { status: 204 })]);
    const result = await delistFromDepop("777", TOKENS);
    expect(result.ok).toBe(true);
  });

  it("returns retryable=false for 4xx", async () => {
    mockFetchSequence([new Response(JSON.stringify({ error: "not found" }), { status: 404 })]);
    const result = await delistFromDepop("999", TOKENS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryable).toBe(false);
  });

  it("returns retryable=true for 500", async () => {
    mockFetchSequence([new Response("server error", { status: 500 })]);
    const result = await delistFromDepop("999", TOKENS);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryable).toBe(true);
  });
});

// ─── checkDepopStatus ─────────────────────────────────────────────────────────

describe("checkDepopStatus", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns live for active listing", async () => {
    mockFetchSequence([new Response(JSON.stringify({ status: "active" }), { status: 200 })]);
    expect(await checkDepopStatus("1", TOKENS)).toEqual({ ok: true, status: "live" });
  });

  it("returns sold for sold listing", async () => {
    mockFetchSequence([new Response(JSON.stringify({ status: "sold" }), { status: 200 })]);
    expect(await checkDepopStatus("1", TOKENS)).toEqual({ ok: true, status: "sold" });
  });

  it("returns delisted for deleted status", async () => {
    mockFetchSequence([new Response(JSON.stringify({ status: "deleted" }), { status: 200 })]);
    expect(await checkDepopStatus("1", TOKENS)).toEqual({ ok: true, status: "delisted" });
  });

  it("returns delisted for 404", async () => {
    mockFetchSequence([new Response(JSON.stringify({ error: "not found" }), { status: 404 })]);
    expect(await checkDepopStatus("1", TOKENS)).toEqual({ ok: true, status: "delisted" });
  });

  it("returns unknown for unrecognised status string", async () => {
    mockFetchSequence([new Response(JSON.stringify({ status: "draft" }), { status: 200 })]);
    const result = await checkDepopStatus("1", TOKENS);
    expect(result).toEqual({ ok: true, status: "unknown" });
  });
});
