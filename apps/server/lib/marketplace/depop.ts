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

import type {
  CanonicalListing,
  DepopTokens,
  PublishResult,
  DelistResult,
  StatusResult,
  ConnectionProbeResult,
  PublishOptions,
} from "./types";
import { mapCanonicalCategoryToDepop } from "../categories";
import {
  attachMarketplaceDebugData,
  createMarketplaceDebugData,
  debugPlatformData,
  recordMarketplaceRequest,
} from "./debug";

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

export function mapCategory(category: string | null): DepopCategory {
  return mapCanonicalCategoryToDepop(category) ?? { group: "clothing", productType: "t-shirts" };
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

export function mapCondition(condition: string | null): string {
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

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

async function identify(accessToken: string): Promise<Record<string, unknown> | null> {
  const result = await apiFetch(`${DEPOP_API}/api/v1/auth/identify/`, {
    headers: makeHeaders(accessToken),
  });
  return result as Record<string, unknown> | null;
}

async function getShipFromAddress(accessToken: string): Promise<number> {
  const addrs = await apiFetch(`${DEPOP_API}/api/v1/addresses/`, {
    headers: makeHeaders(accessToken),
  }) as unknown as { id: number }[];
  if (addrs?.length > 0) return addrs[0].id;
  throw new Error("No address on Depop account");
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function verifyDepopConnection(tokens: DepopTokens): Promise<ConnectionProbeResult> {
  const accessToken = pickString(tokens.access_token);
  if (!accessToken) {
    return { ok: false, error: "Invalid Depop tokens: access_token is required" };
  }

  try {
    const auth = await identify(accessToken);
    const authUser =
      auth && typeof auth.user === "object" && auth.user !== null
        ? (auth.user as Record<string, unknown>)
        : null;

    const platformUsername =
      pickString(auth?.username) ??
      pickString(auth?.handle) ??
      pickString(auth?.name) ??
      pickString(authUser?.username) ??
      pickString(authUser?.handle) ??
      pickString(authUser?.name);

    return { ok: true, platformUsername };
  } catch (err) {
    if (err instanceof DepopError && (err.statusCode === 401 || err.statusCode === 403)) {
      return { ok: false, error: "Depop authentication failed. Please reconnect your account." };
    }
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Depop verification failed: ${error}` };
  }
}

export async function publishToDepop(
  listing: CanonicalListing,
  tokens: DepopTokens,
  options: PublishOptions = {}
): Promise<PublishResult> {
  const { access_token } = tokens;
  const mode = options.mode ?? "live";

  const debug = createMarketplaceDebugData();

  try {
    // 1. Resolve userId + ship-from address
    const userId = await resolveUserId(access_token);
    const shipFromAddressId = await getShipFromAddress(access_token);

    // 2. Upload photos (Depop requires pictures as integer IDs)
    const pictureIds: number[] = [];
    for (const url of listing.photos.slice(0, 4)) {
      pictureIds.push(await uploadPhotoFromUrl(url, access_token));
    }

    // 3. Map category + condition
    const mappedCategory = mapCanonicalCategoryToDepop(listing.category);
    if (!mappedCategory) {
      return { ok: false, error: "Depop does not support this category yet.", retryable: false };
    }
    const { group, productType } = mappedCategory;
    const condition = mapCondition(listing.condition);

    // 4. Create or reuse draft
    const existingDraftId = options.existingPlatformData?.remote_state === "draft"
      ? Number(options.existingPlatformListingId)
      : Number.NaN;

    const draftId = Number.isFinite(existingDraftId)
      ? existingDraftId
      : (await (() => {
        recordMarketplaceRequest({
          debug,
          platform: "depop",
          listingId: listing.id,
          request: {
            operation: "create_draft",
            method: "POST",
            endpoint: "/api/v2/drafts/",
            payload: {},
          },
        });
        return apiFetch(`${DEPOP_API}/api/v2/drafts/`, {
          method: "POST",
          headers: makeHeaders(access_token),
          body: JSON.stringify({}),
        }) as Promise<{ id: number }>;
      })()).id;

    // 5. Update draft with full payload
    const draftPayload = {
      id: draftId,
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

    recordMarketplaceRequest({
      debug,
      platform: "depop",
      listingId: listing.id,
      request: {
        operation: "update_draft",
        method: "PUT",
        endpoint: `/api/v2/drafts/${draftId}/`,
        payload: draftPayload,
      },
    });
    await apiFetch(`${DEPOP_API}/api/v2/drafts/${draftId}/`, {
      method: "PUT",
      headers: makeHeaders(access_token),
      body: JSON.stringify(draftPayload),
    });

    if (mode === "draft") {
      return {
        ok: true,
        platformListingId: String(draftId),
        remoteState: "draft",
        modeUsed: "draft",
        platformData: attachMarketplaceDebugData({
          userId,
          ...draftPayload,
          remote_state: "draft",
        }, debug),
      };
    }

    // 6. Publish (PUT to products endpoint from draft edit page — the only route that works)
    recordMarketplaceRequest({
      debug,
      platform: "depop",
      listingId: listing.id,
      request: {
        operation: "publish_listing",
        method: "PUT",
        endpoint: `/api/v2/products/${draftId}/`,
        payload: draftPayload,
      },
    });
    const published = await apiFetch(`${DEPOP_API}/api/v2/products/${draftId}/`, {
      method: "PUT",
      headers: {
        ...makeHeaders(access_token),
        Referer: `https://www.depop.com/products/edit/${draftId}/`,
      },
      body: JSON.stringify(draftPayload),
    }) as { id: number };

    const depopId = String(published.id ?? draftId);
    return {
      ok: true,
      platformListingId: depopId,
      remoteState: "live",
      modeUsed: "live",
      platformData: attachMarketplaceDebugData({ userId, ...draftPayload, remote_state: "live" }, debug),
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const retryable = err instanceof DepopError
      ? err.statusCode >= 500 || err.statusCode === 429
      : true;
    return { ok: false, error, retryable, platformData: debugPlatformData(debug) };
  }
}

export async function deleteDepopDraft(
  platformListingId: string,
  tokens: DepopTokens
): Promise<DelistResult> {
  const { access_token } = tokens;
  try {
    await apiFetch(`${DEPOP_API}/api/v1/drafts/${platformListingId}/`, {
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
