/**
 * Depop marketplace posting module.
 * Ported from tools/depop/depop-api.js with TypeScript + Vercel Blob URL support.
 *
 * Auth: Bearer access_token (WebView magic link capture)
 * TLS: impit (Rust Chrome TLS) required server-side. Falls back gracefully if unavailable.
 * Photos: Blob URLs uploaded to Depop S3 via presign flow. Images must be square.
 *
 * Listing flow: POST /api/v2/drafts/ → PUT /api/v2/drafts/:id → PUT /api/v2/products/:id
 * (Direct POST to /api/v2/products/ returns 400 — draft-first is required)
 */

import type { CanonicalListing, DepopTokens, PublishResult, DelistResult, StatusResult } from "./types";

const DEPOP_API = "https://webapi.depop.com";

// ─── impit loader (optional — falls back to native fetch if unavailable) ──────

let impitFetch: typeof fetch | null = null;

async function loadImpit() {
  if (impitFetch) return impitFetch;
  try {
    const { Impit } = await import("impit");
    const client = new Impit({ browser: "chrome" });
    impitFetch = client.fetch.bind(client) as typeof fetch;
  } catch {
    // impit not available (e.g., Vercel serverless). Use native fetch — may get blocked by Cloudflare.
    console.warn("[depop] impit unavailable, using native fetch (may be blocked by Cloudflare)");
    impitFetch = fetch;
  }
  return impitFetch;
}

// ─── Category mapping ─────────────────────────────────────────────────────────

type DepopCategory = { group: string; productType: string };

const CATEGORY_MAP: Record<string, DepopCategory> = {
  "t-shirt": { group: "clothing", productType: "t-shirts" },
  "shirt": { group: "clothing", productType: "shirts" },
  "hoodie": { group: "clothing", productType: "sweatshirts-hoodies" },
  "sweatshirt": { group: "clothing", productType: "sweatshirts-hoodies" },
  "sweater": { group: "clothing", productType: "knitwear" },
  "jacket": { group: "clothing", productType: "coats-jackets" },
  "coat": { group: "clothing", productType: "coats-jackets" },
  "pants": { group: "clothing", productType: "trousers" },
  "jeans": { group: "clothing", productType: "jeans" },
  "shorts": { group: "clothing", productType: "shorts" },
  "sneakers": { group: "shoes", productType: "trainers" },
  "boots": { group: "shoes", productType: "boots" },
  "shoes": { group: "shoes", productType: "shoes" },
  "bag": { group: "bags", productType: "bags" },
  "wallet": { group: "accessories", productType: "wallet-purses" },
  "belt": { group: "accessories", productType: "belts" },
  "hat": { group: "accessories", productType: "hats" },
  "watch": { group: "accessories", productType: "watches" },
};

function mapCategory(category: string | null): DepopCategory {
  if (!category) return { group: "clothing", productType: "t-shirts" };
  const lower = category.toLowerCase();
  for (const [key, value] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(key)) return value;
  }
  return { group: "clothing", productType: "t-shirts" };
}

// ─── Condition mapping ────────────────────────────────────────────────────────

const CONDITION_MAP: Record<string, string> = {
  "new": "brand_new",
  "brand_new": "brand_new",
  "nwt": "brand_new",
  "gently_used": "excellent_condition",
  "used": "good_condition",
  "heavily_used": "fair_condition",
};

function mapCondition(condition: string | null): string {
  if (!condition) return "excellent_condition";
  const lower = condition.toLowerCase().replace(/[\s-]+/g, "_");
  return CONDITION_MAP[lower] ?? "excellent_condition";
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function makeHeaders(accessToken: string) {
  return {
    Accept: "*/*",
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
    Origin: "https://www.depop.com",
    Referer: "https://www.depop.com/",
  };
}

class DepopError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(`Depop API error ${statusCode}: ${message}`);
    this.name = "DepopError";
  }
}

async function apiFetch(url: string, options: RequestInit = {}) {
  const fetchFn = await loadImpit();
  const res = await fetchFn(url, options);
  if (!res.ok) {
    const text = await res.text();
    let detail: unknown;
    try { detail = JSON.parse(text); } catch { detail = text; }
    throw new DepopError(res.status, JSON.stringify(detail));
  }
  if (res.status === 204) return null;
  return res.json() as Promise<Record<string, unknown>>;
}

// ─── Image upload ─────────────────────────────────────────────────────────────

/**
 * Uploads a photo from a Vercel Blob URL to Depop S3.
 * Returns the Depop picture ID for use in draft.pictures array.
 * Note: Images should be square (Depop crops non-square images).
 */
async function uploadPhotoFromUrl(blobUrl: string, accessToken: string): Promise<number> {
  const fetchFn = await loadImpit();

  // Step 1: Get presigned URL
  const presigned = await apiFetch(`${DEPOP_API}/api/v2/pictures/`, {
    method: "POST",
    headers: makeHeaders(accessToken),
    body: JSON.stringify({ type: "PRODUCT", extension: "jpg" }),
  }) as { id: number; url: string };

  // Step 2: Fetch photo from Vercel Blob
  const photoRes = await fetch(blobUrl);
  if (!photoRes.ok) throw new Error(`Failed to fetch photo from Blob: ${blobUrl}`);
  const photoBuffer = await photoRes.arrayBuffer();

  // Step 3: PUT to presigned S3 URL
  const uploadRes = await fetchFn(presigned.url, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: photoBuffer,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`Depop S3 upload failed ${uploadRes.status}: ${text}`);
  }

  return presigned.id;
}

// ─── User info ────────────────────────────────────────────────────────────────

async function resolveUserId(accessToken: string): Promise<string> {
  const addrs = await apiFetch(`${DEPOP_API}/api/v1/addresses/`, {
    headers: makeHeaders(accessToken),
  }) as unknown as { userId: string }[];
  if (addrs?.length > 0) return String(addrs[0].userId);
  throw new Error("Could not resolve Depop userId — no addresses found on account");
}

async function getShipFromAddress(accessToken: string): Promise<number> {
  const addrs = await apiFetch(`${DEPOP_API}/api/v1/addresses/`, {
    headers: makeHeaders(accessToken),
  }) as unknown as { id: number }[];
  if (addrs?.length > 0) return addrs[0].id;
  throw new Error("No address on Depop account");
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function publishToDepop(
  listing: CanonicalListing,
  tokens: DepopTokens
): Promise<PublishResult> {
  const { access_token } = tokens;

  try {
    // 1. Resolve userId + ship-from address
    const [userId, shipFromAddressId] = await Promise.all([
      resolveUserId(access_token),
      getShipFromAddress(access_token),
    ]);

    // 2. Upload photos (Depop requires pictures as integer IDs)
    const pictureIds = await Promise.all(
      listing.photos.slice(0, 4).map((url) => uploadPhotoFromUrl(url, access_token))
    );

    // 3. Map category + condition
    const { group, productType } = mapCategory(listing.category);
    const condition = mapCondition(listing.condition);

    // 4. Create draft
    const draft = await apiFetch(`${DEPOP_API}/api/v2/drafts/`, {
      method: "POST",
      headers: makeHeaders(access_token),
      body: JSON.stringify({}),
    }) as { id: number };

    // 5. Update draft with full payload
    const draftPayload = {
      id: draft.id,
      description: `${listing.title}\n\n${listing.description}`,
      pictures: pictureIds,
      priceAmount: listing.price.toFixed(2),
      priceCurrency: "USD",
      quantity: 1,
      condition,
      gender: "male", // Default — Depop doesn't have unisex at the top level
      group,
      productType,
      brand: listing.brand?.toLowerCase().replace(/\s+/g, "-") ?? "",
      shippingMethods: [
        {
          payer: "buyer",
          shipFromAddressId,
          shippingProviderId: "USPS",
          parcelSizeId: "under_4oz",
        },
      ],
      attributes: {},
      isKids: false,
    };

    await apiFetch(`${DEPOP_API}/api/v2/drafts/${draft.id}/`, {
      method: "PUT",
      headers: makeHeaders(access_token),
      body: JSON.stringify(draftPayload),
    });

    // 6. Publish (PUT to products endpoint from draft edit page — the only route that works)
    const published = await apiFetch(`${DEPOP_API}/api/v2/products/${draft.id}/`, {
      method: "PUT",
      headers: {
        ...makeHeaders(access_token),
        Referer: `https://www.depop.com/products/edit/${draft.id}/`,
      },
      body: JSON.stringify(draftPayload),
    }) as { id: number };

    const depopId = String(published.id ?? draft.id);
    return { ok: true, platformListingId: depopId, platformData: { userId, ...draftPayload } };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const retryable = err instanceof DepopError
      ? err.statusCode >= 500 || err.statusCode === 429
      : true;
    return { ok: false, error, retryable };
  }
}

export async function delistFromDepop(
  platformListingId: string,
  tokens: DepopTokens
): Promise<DelistResult> {
  const { access_token } = tokens;
  try {
    await apiFetch(`${DEPOP_API}/api/v1/products/${platformListingId}/`, {
      method: "DELETE",
      headers: makeHeaders(access_token),
    });
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const retryable = err instanceof DepopError ? err.statusCode >= 500 : true;
    return { ok: false, error, retryable };
  }
}

export async function checkDepopStatus(
  platformListingId: string,
  tokens: DepopTokens
): Promise<StatusResult> {
  const { access_token } = tokens;
  try {
    const result = await apiFetch(
      `${DEPOP_API}/api/v2/products/${platformListingId}/`,
      { headers: makeHeaders(access_token) }
    ) as { status: string } | null;

    if (!result) return { ok: true, status: "delisted" };

    const statusMap: Record<string, "live" | "sold" | "delisted"> = {
      active: "live",
      sold: "sold",
      deleted: "delisted",
    };
    const status = statusMap[result.status] ?? "unknown";
    return { ok: true, status: status as "live" | "sold" | "delisted" | "unknown" };
  } catch (err) {
    if (err instanceof DepopError && err.statusCode === 404) {
      return { ok: true, status: "delisted" };
    }
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error };
  }
}
