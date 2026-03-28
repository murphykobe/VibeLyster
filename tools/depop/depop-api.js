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
 */

import { Impit } from "impit";

const DEPOP_API = "https://webapi.depop.com";

const impit = new Impit({ browser: "chrome" });

function makeHeaders(accessToken) {
  return {
    Accept: "*/*",
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
    Origin: "https://www.depop.com",
    Referer: "https://www.depop.com/",
  };
}

async function apiFetch(url, options = {}) {
  const res = await impit.fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    let detail;
    try {
      detail = JSON.parse(text);
    } catch {
      detail = text;
    }
    throw new Error(`Depop API error ${res.status}: ${JSON.stringify(detail)}`);
  }
  if (res.status === 204) return null;
  return res.json();
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
    return { loggedIn: false, error: e.message };
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
  const mimeType = ext === "png" ? "image/png" : "image/jpeg";

  // Step 1: Get presigned S3 URL
  const presigned = await apiFetch(`${DEPOP_API}/api/v2/pictures/`, {
    method: "POST",
    headers: makeHeaders(accessToken),
    body: JSON.stringify({ type: "PRODUCT", extension: ext }),
  });

  // Step 2: Upload image to presigned S3 URL
  const imageBuffer = await readFile(imagePath);
  const uploadRes = await impit.fetch(presigned.url, {
    method: "PUT",
    headers: { "Content-Type": mimeType },
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
