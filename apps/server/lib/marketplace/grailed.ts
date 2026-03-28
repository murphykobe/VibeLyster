/**
 * Grailed marketplace posting module.
 * Ported from tools/grailed/grailed-api.js with TypeScript + Vercel Blob URL support.
 *
 * Auth: CSRF token + session cookies (WebView capture)
 * Photos: Blob URLs are uploaded to Grailed S3 via presign flow
 */

import type { CanonicalListing, GrailedTokens, PublishResult, DelistResult, StatusResult } from "./types";

const GRAILED_API = "https://www.grailed.com/api";
const GRAILED_S3 = "https://grailed-media.s3.amazonaws.com/";

// ─── Category mapping ────────────────────────────────────────────────────────
// Maps canonical category strings to Grailed category_path values.
// Extend as needed — these cover the most common resale categories.

const CATEGORY_MAP: Record<string, string> = {
  // Tops
  "t-shirt": "tops.t_shirts",
  "shirt": "tops.shirts",
  "hoodie": "tops.sweatshirts_hoodies",
  "sweatshirt": "tops.sweatshirts_hoodies",
  "sweater": "tops.sweaters_knitwear",
  "jacket": "tops.jackets",
  "coat": "tops.coats",
  // Bottoms
  "pants": "bottoms.pants",
  "jeans": "bottoms.denim",
  "shorts": "bottoms.shorts",
  "trousers": "bottoms.pants",
  // Footwear
  "sneakers": "footwear.sneakers",
  "boots": "footwear.boots",
  "shoes": "footwear.dress_shoes",
  "sandals": "footwear.sandals",
  // Accessories
  "bag": "accessories.bags_luggage",
  "wallet": "accessories.wallets",
  "belt": "accessories.belts",
  "hat": "accessories.hats_scarves_gloves",
  "watch": "accessories.watches",
  // Tailoring
  "suit": "tailoring.suits",
  "blazer": "tailoring.blazers_sportcoats",
};

function mapCategory(category: string | null): string {
  if (!category) return "tops.t_shirts";
  const lower = category.toLowerCase();
  for (const [key, value] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(key)) return value;
  }
  return "tops.t_shirts"; // fallback
}

// ─── Condition mapping ────────────────────────────────────────────────────────

const CONDITION_MAP: Record<string, string> = {
  "new": "is_new",
  "brand_new": "is_new",
  "nwt": "is_new",
  "gently_used": "is_gently_used",
  "used": "is_used",
  "heavily_used": "is_heavily_used",
};

function mapCondition(condition: string | null): string {
  if (!condition) return "is_gently_used";
  const lower = condition.toLowerCase().replace(/\s+/g, "_");
  return CONDITION_MAP[lower] ?? "is_gently_used";
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function makeHeaders(csrfToken: string, cookies: string) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "accept-version": "v1",
    "x-csrf-token": csrfToken,
    Cookie: cookies,
  };
}

async function apiFetch(url: string, options: RequestInit = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    let detail: unknown;
    try { detail = JSON.parse(text); } catch { detail = text; }
    throw new GrailedError(res.status, JSON.stringify(detail));
  }
  return res.json() as Promise<Record<string, unknown>>;
}

class GrailedError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(`Grailed API error ${statusCode}: ${message}`);
    this.name = "GrailedError";
  }
}

// ─── Image upload ─────────────────────────────────────────────────────────────

/**
 * Uploads a photo from a Vercel Blob URL to Grailed S3.
 * Returns the Grailed image_url for use in listing photos array.
 */
async function uploadPhotoFromUrl(
  blobUrl: string,
  csrfToken: string,
  cookies: string
): Promise<string> {
  // Step 1: Get presigned URL
  const presign = await apiFetch(`${GRAILED_API}/photos/presign/listing`, {
    headers: makeHeaders(csrfToken, cookies),
  });
  const { fields, url: s3Url, image_url: imageUrl } = (presign as { data: { fields: Record<string, string>; url: string; image_url: string } }).data;

  // Step 2: Fetch the photo from Vercel Blob
  const photoRes = await fetch(blobUrl);
  if (!photoRes.ok) throw new Error(`Failed to fetch photo from Blob: ${blobUrl}`);
  const photoBuffer = await photoRes.arrayBuffer();
  const blob = new Blob([photoBuffer], { type: "image/jpeg" });

  // Step 3: Upload to S3
  const form = new FormData();
  for (const [key, val] of Object.entries(fields)) {
    form.append(key, val);
  }
  form.append("Content-Type", "image/jpeg");
  form.append("file", blob, "photo.jpg");

  const s3Res = await fetch(s3Url ?? GRAILED_S3, {
    method: "POST",
    body: form,
    headers: {
      accept: "*/*",
      origin: "https://www.grailed.com",
      referer: "https://www.grailed.com",
    },
  });

  if (!s3Res.ok && s3Res.status !== 204) {
    const text = await s3Res.text();
    throw new Error(`Grailed S3 upload failed ${s3Res.status}: ${text}`);
  }

  return imageUrl;
}

// ─── User info ────────────────────────────────────────────────────────────────

async function getMe(csrfToken: string, cookies: string) {
  return apiFetch(`${GRAILED_API}/users/me`, { headers: makeHeaders(csrfToken, cookies) });
}

async function getAddresses(userId: number | string, csrfToken: string, cookies: string) {
  return apiFetch(`${GRAILED_API}/users/${userId}/postal_addresses`, {
    headers: makeHeaders(csrfToken, cookies),
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function publishToGrailed(
  listing: CanonicalListing,
  tokens: GrailedTokens
): Promise<PublishResult> {
  const { csrf_token, cookies } = tokens;

  try {
    // 1. Get user ID + return address
    const me = await getMe(csrf_token, cookies);
    const userId = (me as { data: { id: number } }).data.id;
    const addrsData = await getAddresses(userId, csrf_token, cookies);
    const returnAddressId = ((addrsData as { data: { id: number }[] }).data ?? [])[0]?.id;
    if (!returnAddressId) throw new Error("No return address on Grailed account");

    // 2. Upload photos
    const uploadedPhotos = await Promise.all(
      listing.photos.slice(0, 8).map(async (url, i) => {
        const imageUrl = await uploadPhotoFromUrl(url, csrf_token, cookies);
        return { url: imageUrl, width: 1080, height: 1080, rotate: 0, position: i };
      })
    );

    // 3. Build listing payload
    const payload = {
      buynow: true,
      category_path: mapCategory(listing.category),
      condition: mapCondition(listing.condition),
      description: listing.description,
      designers: listing.brand
        ? [{ name: listing.brand }] // Grailed will match by name
        : [],
      duplicate_listing: false,
      hidden_from_algolia: false,
      makeoffer: true,
      measurements: [],
      minimum_price: null,
      photos: uploadedPhotos,
      price: String(listing.price),
      return_address_id: returnAddressId,
      shipping: {
        us: { amount: 0, enabled: true },
        ca: { amount: 0, enabled: false },
        uk: { amount: 0, enabled: false },
        eu: { amount: 0, enabled: false },
        asia: { amount: 0, enabled: false },
        au: { amount: 0, enabled: false },
        other: { amount: 0, enabled: false },
      },
      shipping_label: { free_shipping: false },
      size: listing.size ?? "one size",
      styles: [],
      exact_size: null,
      title: listing.title,
      traits: Object.entries(listing.traits ?? {}).map(([name, value]) => ({ name, value })),
    };

    // 4. Publish
    const result = await apiFetch(`${GRAILED_API}/listings`, {
      method: "POST",
      headers: makeHeaders(csrf_token, cookies),
      body: JSON.stringify(payload),
    });

    const grailedId = String((result as { data: { id: number } }).data.id);
    return { ok: true, platformListingId: grailedId, platformData: payload };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const retryable = err instanceof GrailedError
      ? err.statusCode >= 500 || err.statusCode === 429
      : true;
    return { ok: false, error, retryable };
  }
}

export async function delistFromGrailed(
  platformListingId: string,
  tokens: GrailedTokens
): Promise<DelistResult> {
  const { csrf_token, cookies } = tokens;
  try {
    await apiFetch(`${GRAILED_API}/listings/${platformListingId}`, {
      method: "DELETE",
      headers: makeHeaders(csrf_token, cookies),
    });
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const retryable = err instanceof GrailedError ? err.statusCode >= 500 : true;
    return { ok: false, error, retryable };
  }
}

export async function checkGrailedStatus(
  platformListingId: string
): Promise<StatusResult> {
  try {
    const result = await apiFetch(`${GRAILED_API}/listings/${platformListingId}`);
    const data = (result as { data: { sold: boolean; is_bumped?: boolean } }).data;
    const status = data.sold ? "sold" : "live";
    return { ok: true, status };
  } catch (err) {
    if (err instanceof GrailedError && err.statusCode === 404) {
      return { ok: true, status: "delisted" };
    }
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error };
  }
}
