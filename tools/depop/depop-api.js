/**
 * Depop Internal API Client
 *
 * Uses Depop's internal REST API with Bearer token auth.
 * Requires `impit` for Chrome TLS fingerprint to bypass Cloudflare.
 *
 * API Base: https://webapi.depop.com/
 * Auth: access_token only (userId is auto-resolved)
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

export async function uploadImage(imagePath, accessToken) {
  const { readFile } = await import("node:fs/promises");
  const imageBuffer = await readFile(imagePath);
  const blob = new Blob([imageBuffer], { type: "image/jpeg" });

  const form = new FormData();
  form.append("file", blob, "photo.jpg");

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Origin: "https://www.depop.com",
    Referer: "https://www.depop.com/products/create/",
  };

  const res = await impit.fetch(`${DEPOP_API}/api/v2/pictures/`, {
    method: "POST",
    headers,
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Depop image upload failed ${res.status}: ${text}`);
  }

  return res.json();
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function createProduct(productData, accessToken) {
  return apiFetch(`${DEPOP_API}/api/v2/products/`, {
    method: "POST",
    headers: {
      ...makeHeaders(accessToken),
      Referer: "https://www.depop.com/products/create/",
    },
    body: JSON.stringify(productData),
  });
}

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
  return apiFetch(`${DEPOP_API}/api/v2/products/${productId}/`, {
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
