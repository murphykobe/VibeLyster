/**
 * Depop Internal API Client
 *
 * Uses Depop's internal REST API with Bearer token auth.
 * Requires `impit` for Chrome TLS fingerprint to bypass Cloudflare.
 *
 * API Base: https://webapi.depop.com/
 * Auth: access_token only (userId is auto-resolved)
 *
 * Listing flow: draft → update draft → publish (POST from draft edit page)
 * Direct POST to /api/v2/products/ returns empty 400 — draft-first is required.
 *
 * Picture upload (/presentation/api/v1/pictures/, see uploadImage below) gets
 * hard-blocked at Cloudflare's edge — never reaches Depop's backend at all —
 * unless the request also carries real Fetch Metadata and Client Hints
 * headers (sec-fetch-*, sec-ch-ua*). TLS fingerprint alone (impit's
 * browser: "chrome") is not sufficient for this endpoint; every other
 * endpoint here works without them, so they're added broadly in
 * makeHeaders() rather than only on the upload call, since a real browser
 * sends them on every fetch, not just this one.
 */

import { Impit } from "impit";

const DEPOP_API = "https://webapi.depop.com";

const impit = new Impit({ browser: "chrome" });

function makeHeaders(accessToken) {
  return {
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    authorization: `Bearer ${accessToken}`,
    "content-type": "application/json",
    origin: "https://www.depop.com",
    priority: "u=1, i",
    referer: "https://www.depop.com/",
    "sec-ch-ua": '"Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
  };
}

/**
 * Reads pixel width/height from a PNG or JPEG buffer without a dependency.
 * Depop's picture-upload endpoint requires the real dimensions in its
 * request body (guessing or omitting them is not accepted).
 */
function readImageDimensions(buffer, ext) {
  if (ext === "png") {
    // Signature (8 bytes) + chunk length (4) + "IHDR" (4), then width/height
    // as big-endian uint32s — a fixed, guaranteed layout for every PNG.
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  // JPEG: scan markers for a Start-of-Frame (SOFn) segment, which holds
  // height then width as big-endian uint16s.
  let offset = 2; // skip the SOI marker (0xFFD8)
  while (offset < buffer.length - 1) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marker = buffer[offset + 1];
    // Markers with no payload: TEM and the RSTn restart markers.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }
    const segmentLength = buffer.readUInt16BE(offset + 2);
    // SOF0–SOF15 except the DHT/JPG/DAC markers, which share the 0xC4/0xC8/0xCC numbers.
    const isSOF = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSOF) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + segmentLength;
  }
  throw new Error(`Could not read JPEG dimensions from ${buffer.length}-byte file`);
}

/**
 * Thrown by apiFetch on any non-ok response. Carries structured
 * classification (status, whether Cloudflare's edge answered instead of
 * Depop's backend) so callers — the CLI's exit-code contract — never have
 * to parse `.message`. `.message` itself is unchanged, so anything only
 * reading it still works.
 */
export class DepopApiError extends Error {
  constructor(message, { status, cloudflareBlock = false, body } = {}) {
    super(message);
    this.name = "DepopApiError";
    this.status = status;
    this.cloudflareBlock = cloudflareBlock;
    this.body = body;
  }
}

async function apiFetch(url, options = {}) {
  const res = await impit.fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    let detail;
    let cloudflareBlock = false;
    try {
      detail = JSON.parse(text);
    } catch {
      // Depop's own backend returns JSON even for 401s (e.g. "You must be
      // logged in"); confirmed 2026-09-13. A non-JSON body this large is
      // Cloudflare's or Depop's own branded edge block answering on its
      // own — the pictures/ 403 investigated that day was exactly this
      // shape — not something Depop's application code produced.
      detail = text;
      cloudflareBlock = true;
    }
    throw new DepopApiError(`Depop API error ${res.status}: ${JSON.stringify(detail)}`, {
      status: res.status,
      cloudflareBlock,
      body: detail,
    });
  }
  if (res.status === 204) return null;
  return res.json();
}

/**
 * Classifies any error from this module into the CLI's exit-code contract.
 * Exported so the CLI (and its tests) share one source of truth.
 */
export function classifyError(error) {
  if (error instanceof DepopApiError) {
    if (error.cloudflareBlock) return { exitCode: 4, key: "CLOUDFLARE_BLOCK" };
    if (error.status === 401 || error.status === 403) {
      return { exitCode: 3, key: "TOKEN_EXPIRED" };
    }
    return { exitCode: 1, key: "API_ERROR", status: error.status };
  }
  return { exitCode: 1, key: "ERROR" };
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function checkLogin(accessToken) {
  try {
    const data = await apiFetch(
      `${DEPOP_API}/api/v1/sellerOnboarding/sellerStatus/`,
      { headers: makeHeaders(accessToken) }
    );
    return { loggedIn: true, user: data };
  } catch (e) {
    // exitCode/key are additive — existing callers reading only
    // loggedIn/error see the same shape as before.
    return { loggedIn: false, error: e.message, ...classifyError(e) };
  }
}

export async function resolveUserId(accessToken) {
  const addrs = await apiFetch(`${DEPOP_API}/api/v1/addresses/`, {
    headers: makeHeaders(accessToken),
  });
  if (addrs?.length > 0) return String(addrs[0].userId);
  throw new Error("Could not resolve userId — no addresses found on account");
}

// ─── Image Upload ─────────────────────────────────────────────────────────────

/**
 * Upload an image to Depop (two-step: get presigned URL, then PUT to S3).
 * Image MUST be square. Returns { id, url }.
 */
export async function uploadImage(imagePath, accessToken) {
  const { readFile } = await import("node:fs/promises");
  const { extname } = await import("node:path");

  const ext = extname(imagePath).slice(1).toLowerCase() || "jpg";
  const imageBuffer = await readFile(imagePath);
  const dimensions = readImageDimensions(imageBuffer, ext);

  // Step 1: Get presigned S3 URL. type is lowercase and dimensions are
  // required — both undocumented, reverse-engineered from a real browser
  // request (Chrome DevTools > Network > Copy as cURL on a live upload).
  const presigned = await apiFetch(`${DEPOP_API}/presentation/api/v1/pictures/`, {
    method: "POST",
    headers: makeHeaders(accessToken),
    body: JSON.stringify({ type: "product", extension: ext, dimensions }),
  });

  // Step 2: Upload image to presigned S3 URL
  const uploadRes = await impit.fetch(presigned.url, {
    method: "PUT",
    headers: { "Content-Type": presigned.content_type },
    body: imageBuffer,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`S3 upload failed ${uploadRes.status}: ${text}`);
  }

  return { id: presigned.id, url: presigned.url.split("?")[0] };
}

// ─── Drafts ──────────────────────────────────────────────────────────────────

export async function createDraft(draftData, accessToken) {
  return apiFetch(`${DEPOP_API}/api/v2/drafts/`, {
    method: "POST",
    headers: makeHeaders(accessToken),
    body: JSON.stringify(draftData),
  });
}

export async function updateDraft(draftId, draftData, accessToken) {
  return apiFetch(`${DEPOP_API}/api/v2/drafts/${draftId}/`, {
    method: "PUT",
    headers: makeHeaders(accessToken),
    body: JSON.stringify({ id: draftId, ...draftData }),
  });
}

export async function getDrafts(accessToken) {
  return apiFetch(`${DEPOP_API}/api/v2/drafts/`, {
    headers: makeHeaders(accessToken),
  });
}

export async function deleteDraft(draftId, accessToken) {
  return apiFetch(`${DEPOP_API}/api/v1/drafts/${draftId}/`, {
    method: "DELETE",
    headers: makeHeaders(accessToken),
  });
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function editProduct(productId, productData, accessToken) {
  return apiFetch(`${DEPOP_API}/api/v2/products/${productId}/`, {
    method: "PUT",
    headers: {
      ...makeHeaders(accessToken),
      Referer: `https://www.depop.com/products/edit/${productId}/`,
    },
    body: JSON.stringify(productData),
  });
}

export async function deleteProduct(productId, accessToken) {
  return apiFetch(`${DEPOP_API}/api/v1/products/${productId}/`, {
    method: "DELETE",
    headers: makeHeaders(accessToken),
  });
}

export async function getProduct(slug, accessToken) {
  return apiFetch(
    `${DEPOP_API}/api/v1/product/by-slug/${slug}/user/?camel_case=true`,
    { headers: makeHeaders(accessToken) }
  );
}

// ─── User Listings ────────────────────────────────────────────────────────────

export async function getListings(accessToken, userId) {
  return apiFetch(
    `${DEPOP_API}/api/v3/shop/${userId}/products/?limit=200&force_fee_calculation=false`,
    { headers: makeHeaders(accessToken) }
  );
}

// ─── Addresses ───────────────────────────────────────────────────────────────

export async function getAddresses(accessToken) {
  return apiFetch(`${DEPOP_API}/api/v1/addresses/`, {
    headers: makeHeaders(accessToken),
  });
}

// ─── Reference Data ─────────────────────────────────────────────────────────

export async function getCategories(accessToken) {
  return apiFetch(
    `${DEPOP_API}/presentation/api/v1/attributes/groups/`,
    { headers: makeHeaders(accessToken) }
  );
}

export async function getProductAttributes(accessToken) {
  return apiFetch(
    `${DEPOP_API}/api/v2/search/filters/productAttributes/?country=en`,
    { headers: makeHeaders(accessToken) }
  );
}

export async function getShippingProviders(accessToken, providerId = "USPS") {
  return apiFetch(
    `${DEPOP_API}/api/v1/shipping-providers/?ids=${providerId}`,
    { headers: makeHeaders(accessToken) }
  );
}
