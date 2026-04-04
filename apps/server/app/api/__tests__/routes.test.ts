/**
 * API route integration tests.
 *
 * Runs against route handlers directly (no HTTP server) with MOCK_MODE=1
 * so no Neon, Clerk, or marketplace APIs are needed. The in-memory mock DB
 * is reset before each test via vitest.setup.ts.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as listListings, POST as createListing } from "../listings/route";
import { GET as getListing, PUT as updateListing, DELETE as deleteListing } from "../listings/[id]/route";
import { POST as connectPlatform, DELETE as disconnectPlatform } from "../connect/route";
import { GET as listConnections } from "../connections/route";
import { POST as publishListing } from "../publish/route";
import { POST as delistListing } from "../delist/route";
import { POST as uploadPhoto } from "../upload/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE = "http://localhost:3001";

/** Build a NextRequest with mock auth headers */
function req(
  method: string,
  path: string,
  opts: { body?: unknown; userId?: string; searchParams?: Record<string, string> } = {}
): NextRequest {
  const url = new URL(path, BASE);
  if (opts.searchParams) {
    for (const [k, v] of Object.entries(opts.searchParams)) {
      url.searchParams.set(k, v);
    }
  }
  return new NextRequest(url, {
    method,
    headers: {
      "x-mock-user-id": opts.userId ?? "user-a",
      "content-type": "application/json",
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

function formReq(path: string, formData: FormData, opts: { userId?: string } = {}): NextRequest {
  return new NextRequest(new URL(path, BASE), {
    method: "POST",
    headers: {
      "x-mock-user-id": opts.userId ?? "user-a",
    },
    body: formData,
  });
}

/** Params wrapper for dynamic route handlers */
function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

const VALID_LISTING = {
  title: "Nike Air Force 1",
  description: "Great condition AF1s",
  price: 120,
  size: "10",
  condition: "gently_used",
  brand: "Nike",
  category: "sneakers",
  photos: ["https://blob.vercel-storage.com/photo.jpg"],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ─── Listings CRUD ────────────────────────────────────────────────────────────

describe("GET /api/listings", () => {
  it("returns empty array when no listings", async () => {
    const res = await listListings(req("GET", "/api/listings"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns only listings for the authenticated user", async () => {
    await createListing(req("POST", "/api/listings", { body: VALID_LISTING, userId: "user-a" }));
    await createListing(req("POST", "/api/listings", { body: VALID_LISTING, userId: "user-b" }));

    const res = await listListings(req("GET", "/api/listings", { userId: "user-a" }));
    const listings = await res.json();
    expect(listings).toHaveLength(1);
    expect(listings[0].title).toBe("Nike Air Force 1");
  });
});

describe("POST /api/listings", () => {
  it("creates listing and returns 201 with id", async () => {
    const res = await createListing(req("POST", "/api/listings", { body: VALID_LISTING }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.title).toBe("Nike Air Force 1");
    expect(data.price).toBe("120");
    expect(data.category).toBe("footwear.sneakers");
  });

  it("returns 400 when title is missing", async () => {
    const res = await createListing(req("POST", "/api/listings", { body: { ...VALID_LISTING, title: "" } }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Validation failed");
    expect(data.details).toBeInstanceOf(Array);
  });

  it("returns 400 when price is negative", async () => {
    const res = await createListing(req("POST", "/api/listings", { body: { ...VALID_LISTING, price: -10 } }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when photos is not an array of URLs", async () => {
    const res = await createListing(req("POST", "/api/listings", { body: { ...VALID_LISTING, photos: ["not-a-url"] } }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for unsupported item categories", async () => {
    const res = await createListing(req("POST", "/api/listings", {
      body: { ...VALID_LISTING, category: "car" },
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("not supported");
  });
});

describe("POST /api/upload", () => {
  it("accepts HEIF files when the filename extension is supported", async () => {
    const formData = new FormData();
    formData.append("file", new File([new Uint8Array([1, 2, 3])], "closet.heif"));

    const res = await uploadPhoto(formReq("/api/upload", formData));

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.url).toContain("closet.heif");
  });

  it("accepts image/jpg by normalizing it to image/jpeg", async () => {
    const formData = new FormData();
    formData.append("file", new File([new Uint8Array([1, 2, 3])], "closet.jpg", { type: "image/jpg" }));

    const res = await uploadPhoto(formReq("/api/upload", formData));

    expect(res.status).toBe(201);
  });

  it("rejects unsupported image types", async () => {
    const formData = new FormData();
    formData.append("file", new File([new Uint8Array([1, 2, 3])], "closet.gif", { type: "image/gif" }));

    const res = await uploadPhoto(formReq("/api/upload", formData));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid file type");
  });
});

describe("GET /api/listings/[id]", () => {
  it("returns listing by id", async () => {
    const createRes = await createListing(req("POST", "/api/listings", { body: VALID_LISTING }));
    const { id } = await createRes.json();

    const res = await getListing(req("GET", `/api/listings/${id}`), params(id));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(id);
    expect(data.title).toBe("Nike Air Force 1");
  });

  it("returns 404 for unknown id", async () => {
    const res = await getListing(
      req("GET", "/api/listings/00000000-0000-4000-8000-000000000000"),
      params("00000000-0000-4000-8000-000000000000")
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when accessing another user's listing", async () => {
    const createRes = await createListing(req("POST", "/api/listings", { body: VALID_LISTING, userId: "user-a" }));
    const { id } = await createRes.json();

    const res = await getListing(req("GET", `/api/listings/${id}`, { userId: "user-b" }), params(id));
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/listings/[id]", () => {
  it("updates listing fields", async () => {
    const createRes = await createListing(req("POST", "/api/listings", { body: VALID_LISTING }));
    const { id } = await createRes.json();

    const res = await updateListing(
      req("PUT", `/api/listings/${id}`, { body: { title: "Updated Title", price: 150 } }),
      params(id)
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.title).toBe("Updated Title");
    expect(data.price).toBe("150");
    // Unchanged fields persist
    expect(data.brand).toBe("Nike");
  });

  it("normalizes updated categories into canonical keys", async () => {
    const createRes = await createListing(req("POST", "/api/listings", { body: VALID_LISTING }));
    const { id } = await createRes.json();

    const res = await updateListing(
      req("PUT", `/api/listings/${id}`, { body: { category: "boots" } }),
      params(id)
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.category).toBe("footwear.boots");
  });

  it("returns 400 when updating to an unsupported item category", async () => {
    const createRes = await createListing(req("POST", "/api/listings", { body: VALID_LISTING }));
    const { id } = await createRes.json();

    const res = await updateListing(
      req("PUT", `/api/listings/${id}`, { body: { category: "car" } }),
      params(id)
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid update (empty title)", async () => {
    const createRes = await createListing(req("POST", "/api/listings", { body: VALID_LISTING }));
    const { id } = await createRes.json();

    const res = await updateListing(
      req("PUT", `/api/listings/${id}`, { body: { title: "" } }),
      params(id)
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown listing", async () => {
    const res = await updateListing(
      req("PUT", "/api/listings/00000000-0000-4000-8000-000000000000", { body: { title: "x" } }),
      params("00000000-0000-4000-8000-000000000000")
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/listings/[id]", () => {
  it("soft-deletes listing (204) and hides it from GET", async () => {
    const createRes = await createListing(req("POST", "/api/listings", { body: VALID_LISTING }));
    const { id } = await createRes.json();

    const delRes = await deleteListing(req("DELETE", `/api/listings/${id}`), params(id));
    expect(delRes.status).toBe(204);

    const getRes = await getListing(req("GET", `/api/listings/${id}`), params(id));
    expect(getRes.status).toBe(404);
  });

  it("returns 404 for unknown listing", async () => {
    const res = await deleteListing(
      req("DELETE", "/api/listings/00000000-0000-4000-8000-000000000000"),
      params("00000000-0000-4000-8000-000000000000")
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 when listing is still live on a platform", async () => {
    // Create listing, connect grailed, publish, then try to delete
    const createRes = await createListing(req("POST", "/api/listings", { body: VALID_LISTING }));
    const { id } = await createRes.json();
    await connectPlatform(req("POST", "/api/connect", { body: { platform: "grailed", tokens: { csrf_token: "x", cookies: "y" } } }));
    await publishListing(req("POST", "/api/publish", { body: { listingId: id, platforms: ["grailed"] } }));

    const res = await deleteListing(req("DELETE", `/api/listings/${id}`), params(id));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.platforms).toContain("grailed");
  });
});

// ─── Marketplace Connections ──────────────────────────────────────────────────

describe("POST /api/connect", () => {
  it("saves connection and returns 201", async () => {
    const res = await connectPlatform(req("POST", "/api/connect", {
      body: { platform: "grailed", tokens: { csrf_token: "abc", cookies: "session=xyz" } },
    }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.platform).toBe("grailed");
    expect(data.platform_username).toBe("mock-grailed-user");
  });

  it("saves mock eBay connection from code exchange payload and returns 201", async () => {
    const res = await connectPlatform(req("POST", "/api/connect", {
      body: {
        platform: "ebay",
        authorizationCode: "ebay-code-1",
        ruName: "vibelyster-accept",
      },
    }));

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.platform).toBe("ebay");
    expect(data.platform_username).toBe("mock-ebay-user");
  });

  it("upserts — reconnecting updates the record", async () => {
    await connectPlatform(req("POST", "/api/connect", { body: { platform: "depop", tokens: { access_token: "tok1" } } }));
    await connectPlatform(req("POST", "/api/connect", { body: { platform: "depop", tokens: { access_token: "tok2" } } }));

    const listRes = await listConnections(req("GET", "/api/connections"));
    const conns = await listRes.json();
    expect(conns.filter((c: { platform: string }) => c.platform === "depop")).toHaveLength(1);
  });

  it("returns 400 for unknown platform", async () => {
    const res = await connectPlatform(req("POST", "/api/connect", {
      body: { platform: "shopify", tokens: { key: "val" } },
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty tokens", async () => {
    const res = await connectPlatform(req("POST", "/api/connect", {
      body: { platform: "grailed", tokens: {} },
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for incomplete eBay payload", async () => {
    const res = await connectPlatform(req("POST", "/api/connect", {
      body: { platform: "ebay", authorizationCode: "ebay-code-1" },
    }));
    expect(res.status).toBe(400);
  });
});

async function loadRealEbayConnectRoute(options: {
  ebayModule?: {
    exchangeEbayAuthorizationCode: ReturnType<typeof vi.fn>;
    verifyEbayConnectionFromTokens: ReturnType<typeof vi.fn>;
  };
} = {}) {
  vi.resetModules();

  const connections: Array<{
    id: string;
    user_id: string;
    platform: string;
    encrypted_tokens: Record<string, unknown>;
    platform_username: string | null;
    connected_at: string;
    expires_at: string | null;
  }> = [];

  const upsertConnection = vi.fn(async (
    userId: string,
    platform: string,
    encryptedTokens: Record<string, unknown>,
    platformUsername?: string | null,
    expiresAt?: string,
    opts?: { replacePlatformUsername?: boolean }
  ) => {
    const existing = connections.find((c) => c.user_id === userId && c.platform === platform);
    const now = "2026-04-03T00:00:00.000Z";
    if (existing) {
      existing.encrypted_tokens = { ...encryptedTokens };
      if (opts?.replacePlatformUsername) {
        existing.platform_username = platformUsername ?? null;
      } else {
        existing.platform_username = platformUsername ?? existing.platform_username;
      }
      existing.connected_at = now;
      existing.expires_at = expiresAt ?? null;
      return { ...existing };
    }

    const row = {
      id: `conn-${connections.length + 1}`,
      user_id: userId,
      platform,
      encrypted_tokens: { ...encryptedTokens },
      platform_username: platformUsername ?? null,
      connected_at: now,
      expires_at: expiresAt ?? null,
    };
    connections.push(row);
    return { ...row };
  });

  vi.doMock("@/lib/mock", () => ({
    isMockMode: () => false,
  }));
  vi.doMock("@/lib/auth", () => ({
    requireAuth: vi.fn().mockResolvedValue({ id: "user-a" }),
    AuthError: class AuthError extends Error {},
    authErrorResponse: vi.fn((err: Error) => Response.json({ error: err.message }, { status: 401 })),
  }));
  vi.doMock("@/lib/db", () => ({
    upsertConnection,
    deleteConnection: vi.fn(),
  }));
  vi.doMock("@/lib/crypto", () => ({
    encryptTokens: (tokens: Record<string, unknown>) => tokens,
  }));
  if (options.ebayModule) {
    vi.doMock("@/lib/marketplace/ebay", () => options.ebayModule);
  }

  const route = await import("../connect/route");
  return { ...route, connections, upsertConnection };
}

describe("POST /api/connect real eBay behavior", () => {
  it("returns 400 for invalid eBay authorization codes", async () => {
    vi.stubEnv("EBAY_CLIENT_ID", "client-123");
    vi.stubEnv("EBAY_CLIENT_SECRET", "secret-456");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("invalid_grant", { status: 400 })));

    const { POST } = await loadRealEbayConnectRoute();
    const res = await POST(req("POST", "/api/connect", {
      body: {
        platform: "ebay",
        authorizationCode: "bad-code",
        ruName: "vibelyster-accept",
      },
    }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/authorization code|invalid/i);
  });

  it("returns 500 for eBay auth misconfiguration failures", async () => {
    vi.stubEnv("EBAY_CLIENT_ID", "client-123");
    vi.stubEnv("EBAY_CLIENT_SECRET", "secret-456");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("forbidden", { status: 403 })));

    const { POST } = await loadRealEbayConnectRoute();
    const res = await POST(req("POST", "/api/connect", {
      body: {
        platform: "ebay",
        authorizationCode: "bad-code",
        ruName: "vibelyster-accept",
      },
    }));

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Internal server error");
  });

  it("clears a stale eBay username when verification returns none", async () => {
    vi.stubEnv("EBAY_CLIENT_ID", "client-123");
    vi.stubEnv("EBAY_CLIENT_SECRET", "secret-456");
    const exchange = vi.fn().mockResolvedValue({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      tokenType: "Bearer",
      expiresIn: 3600,
      refreshTokenExpiresIn: 86400,
    });
    const verify = vi.fn()
      .mockResolvedValueOnce({ ok: true, ebayUserId: "ebay-user-1", platformUsername: "old-handle" })
      .mockResolvedValueOnce({ ok: true, ebayUserId: "ebay-user-1" });

    const { POST } = await loadRealEbayConnectRoute({
      ebayModule: {
        exchangeEbayAuthorizationCode: exchange,
        verifyEbayConnectionFromTokens: verify,
      },
    });

    const first = await POST(req("POST", "/api/connect", {
      body: {
        platform: "ebay",
        authorizationCode: "code-1",
        ruName: "vibelyster-accept",
      },
    }));
    expect(first.status).toBe(201);

    const second = await POST(req("POST", "/api/connect", {
      body: {
        platform: "ebay",
        authorizationCode: "code-2",
        ruName: "vibelyster-accept",
      },
    }));

    expect(second.status).toBe(201);
    const data = await second.json();
    expect(data.platform_username).toBeNull();
  });

  it("returns 400 when eBay verification fails", async () => {
    vi.stubEnv("EBAY_CLIENT_ID", "client-123");
    vi.stubEnv("EBAY_CLIENT_SECRET", "secret-456");
    const exchange = vi.fn().mockResolvedValue({
      accessToken: "access-1",
      refreshToken: "refresh-1",
      tokenType: "Bearer",
      expiresIn: 3600,
      refreshTokenExpiresIn: 86400,
    });
    const verify = vi.fn().mockResolvedValue({ ok: false, error: "eBay verification failed with status 401" });

    const { POST } = await loadRealEbayConnectRoute({
      ebayModule: {
        exchangeEbayAuthorizationCode: exchange,
        verifyEbayConnectionFromTokens: verify,
      },
    });

    const res = await POST(req("POST", "/api/connect", {
      body: {
        platform: "ebay",
        authorizationCode: "code-1",
        ruName: "vibelyster-accept",
      },
    }));

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/verification failed/i);
  });
});

describe("DELETE /api/connect", () => {
  it("removes connection (204)", async () => {
    await connectPlatform(req("POST", "/api/connect", { body: { platform: "grailed", tokens: { csrf_token: "x", cookies: "y" } } }));
    const res = await disconnectPlatform(req("DELETE", "/api/connect", { searchParams: { platform: "grailed" } }));
    expect(res.status).toBe(204);

    const listRes = await listConnections(req("GET", "/api/connections"));
    expect(await listRes.json()).toEqual([]);
  });

  it("returns 404 when no connection exists", async () => {
    const res = await disconnectPlatform(req("DELETE", "/api/connect", { searchParams: { platform: "depop" } }));
    expect(res.status).toBe(404);
  });

  it("returns 400 for missing platform query param", async () => {
    const res = await disconnectPlatform(req("DELETE", "/api/connect"));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/connections", () => {
  it("returns empty array when no connections", async () => {
    const res = await listConnections(req("GET", "/api/connections"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns connected platforms without encrypted_tokens", async () => {
    await connectPlatform(req("POST", "/api/connect", { body: { platform: "grailed", tokens: { csrf_token: "x", cookies: "y" } } }));
    await connectPlatform(req("POST", "/api/connect", { body: { platform: "depop", tokens: { access_token: "t" } } }));

    const res = await listConnections(req("GET", "/api/connections"));
    const conns = await res.json();
    expect(conns).toHaveLength(2);
    const platforms = conns.map((c: { platform: string }) => c.platform).sort();
    expect(platforms).toEqual(["depop", "grailed"]);
    // Tokens must never be returned
    for (const c of conns) {
      expect(c).not.toHaveProperty("encrypted_tokens");
    }
  });
});

// ─── Publish ──────────────────────────────────────────────────────────────────

describe("POST /api/publish", () => {
  async function setup() {
    const createRes = await createListing(req("POST", "/api/listings", { body: VALID_LISTING }));
    const { id } = await createRes.json();
    await connectPlatform(req("POST", "/api/connect", { body: { platform: "grailed", tokens: { csrf_token: "x", cookies: "y" } } }));
    await connectPlatform(req("POST", "/api/connect", { body: { platform: "depop", tokens: { access_token: "t" } } }));
    return id as string;
  }

  it("publishes to connected platform and returns ok:true", async () => {
    const id = await setup();
    const res = await publishListing(req("POST", "/api/publish", { body: { listingId: id, platforms: ["grailed"] } }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results.grailed.ok).toBe(true);
    expect(data.results.grailed.platformListingId).toMatch(/^mock-grailed-/);
  });

  it("publishes to multiple platforms in one call", async () => {
    const id = await setup();
    const res = await publishListing(req("POST", "/api/publish", { body: { listingId: id, platforms: ["grailed", "depop"] } }));
    const data = await res.json();
    expect(data.results.grailed.ok).toBe(true);
    expect(data.results.depop.ok).toBe(true);
  });

  it("returns not-connected error when platform not connected", async () => {
    const createRes = await createListing(req("POST", "/api/listings", { body: VALID_LISTING }));
    const { id } = await createRes.json();
    // No connection seeded
    const res = await publishListing(req("POST", "/api/publish", { body: { listingId: id, platforms: ["grailed"] } }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results.grailed.ok).toBe(false);
    expect(data.results.grailed.error).toMatch(/not connected/i);
  });

  it("returns 404 for unknown listing", async () => {
    const res = await publishListing(req("POST", "/api/publish", { body: { listingId: "00000000-0000-4000-8000-000000000000", platforms: ["grailed"] } }));
    expect(res.status).toBe(404);
  });

  it("returns 400 when listingId is not a UUID", async () => {
    const res = await publishListing(req("POST", "/api/publish", { body: { listingId: "not-a-uuid", platforms: ["grailed"] } }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when platforms array is empty", async () => {
    const id = await setup();
    const res = await publishListing(req("POST", "/api/publish", { body: { listingId: id, platforms: [] } }));
    expect(res.status).toBe(400);
  });

  it("listing platform_listing row is updated to live after publish", async () => {
    const id = await setup();
    await publishListing(req("POST", "/api/publish", { body: { listingId: id, platforms: ["grailed"] } }));

    const getRes = await getListing(req("GET", `/api/listings/${id}`), params(id));
    const listing = await getRes.json();
    const grailedRow = listing.platform_listings.find((pl: { platform: string }) => pl.platform === "grailed");
    expect(grailedRow.status).toBe("live");
    expect(grailedRow.attempt_count).toBe(1);
  });

  it("stores a remote draft when mode=draft", async () => {
    const id = await setup();
    const res = await publishListing(req("POST", "/api/publish", {
      body: { listingId: id, platforms: ["grailed"], mode: "draft" },
    }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results.grailed.ok).toBe(true);
    expect(data.results.grailed.remoteState).toBe("draft");
    expect(data.results.grailed.modeUsed).toBe("draft");

    const getRes = await getListing(req("GET", `/api/listings/${id}`), params(id));
    const listing = await getRes.json();
    const grailedRow = listing.platform_listings.find((pl: { platform: string }) => pl.platform === "grailed");
    expect(grailedRow.status).toBe("pending");
    expect(grailedRow.platform_listing_id).toMatch(/^mock-grailed-draft-/);
    expect(grailedRow.platform_data.remote_state).toBe("draft");
    expect(grailedRow.attempt_count).toBe(1);
  });
});

// ─── Delist ───────────────────────────────────────────────────────────────────

describe("POST /api/delist", () => {
  async function setupPublished() {
    const createRes = await createListing(req("POST", "/api/listings", { body: VALID_LISTING }));
    const { id } = await createRes.json();
    await connectPlatform(req("POST", "/api/connect", { body: { platform: "grailed", tokens: { csrf_token: "x", cookies: "y" } } }));
    await publishListing(req("POST", "/api/publish", { body: { listingId: id, platforms: ["grailed"] } }));
    return id as string;
  }

  it("delists from platform and returns ok:true", async () => {
    const id = await setupPublished();
    const res = await delistListing(req("POST", "/api/delist", { body: { listingId: id, platform: "grailed" } }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("listing status is delisted after delist", async () => {
    const id = await setupPublished();
    await delistListing(req("POST", "/api/delist", { body: { listingId: id, platform: "grailed" } }));

    const getRes = await getListing(req("GET", `/api/listings/${id}`), params(id));
    const listing = await getRes.json();
    const grailedRow = listing.platform_listings.find((pl: { platform: string }) => pl.platform === "grailed");
    expect(grailedRow.status).toBe("delisted");
  });

  it("can delete listing after delisting from all platforms", async () => {
    const id = await setupPublished();
    await delistListing(req("POST", "/api/delist", { body: { listingId: id, platform: "grailed" } }));

    const delRes = await deleteListing(req("DELETE", `/api/listings/${id}`), params(id));
    expect(delRes.status).toBe(204);
  });

  it("returns 404 when listing has no platform listing", async () => {
    const createRes = await createListing(req("POST", "/api/listings", { body: VALID_LISTING }));
    const { id } = await createRes.json();
    const res = await delistListing(req("POST", "/api/delist", { body: { listingId: id, platform: "grailed" } }));
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid platform", async () => {
    const res = await delistListing(req("POST", "/api/delist", { body: { listingId: "00000000-0000-4000-8000-000000000000", platform: "shopify" } }));
    expect(res.status).toBe(400);
  });
});
