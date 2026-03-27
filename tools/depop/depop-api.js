/**
 * Depop Internal API Client
 *
 * Reverse-engineered from Flyp and Crosslist Chrome extensions.
 * Uses Depop's internal REST API with Bearer token auth.
 *
 * API Base: https://webapi.depop.com/
 * Auth: access_token cookie (Bearer) + user_id cookie + _px2 PerimeterX cookie
 *
 * NOTE: PerimeterX (_px2) is an anti-bot fingerprinting system. Token replay
 * works when the _px2 cookie is fresh from the browser. If requests start
 * returning 403/blocked, refresh all three cookies.
 */

const DEPOP_API = "https://webapi.depop.com";

function makeHeaders(accessToken, userId, cookies) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
    "depop-UserId": String(userId),
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Origin: "https://www.depop.com",
    Referer: "https://www.depop.com/",
    Cookie: cookies,
  };
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
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
  // Some endpoints return 204 No Content
  if (res.status === 204) return null;
  return res.json();
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function checkLogin(accessToken, userId, cookies) {
  try {
    const data = await apiFetch(`${DEPOP_API}/api/v1/auth/identify/`, {
      headers: makeHeaders(accessToken, userId, cookies),
    });
    return { loggedIn: true, user: data };
  } catch (e) {
    return { loggedIn: false, error: e.message };
  }
}

// ─── Image Upload ─────────────────────────────────────────────────────────────

/**
 * Upload an image to Depop. Image MUST be square (center-crop first if needed).
 * Returns an object with { id, url } to use in the product payload.
 */
export async function uploadImage(imagePath, accessToken, userId, cookies) {
  const { readFile } = await import("node:fs/promises");
  const imageBuffer = await readFile(imagePath);
  const blob = new Blob([imageBuffer], { type: "image/jpeg" });

  const form = new FormData();
  form.append("file", blob, "photo.jpg");

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "depop-UserId": String(userId),
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Origin: "https://www.depop.com",
    Referer: "https://www.depop.com/products/create/",
    Cookie: cookies,
  };

  const res = await fetch(`${DEPOP_API}/api/v2/pictures/`, {
    method: "POST",
    headers,
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Depop image upload failed ${res.status}: ${text}`);
  }

  const data = await res.json();
  // Returns { id, url } — use both in the product pictures array
  return data;
}

// ─── Products ─────────────────────────────────────────────────────────────────

export async function createProduct(productData, accessToken, userId, cookies) {
  return apiFetch(`${DEPOP_API}/api/v2/products/`, {
    method: "POST",
    headers: {
      ...makeHeaders(accessToken, userId, cookies),
      Referer: "https://www.depop.com/products/create/",
    },
    body: JSON.stringify(productData),
  });
}

export async function editProduct(productId, productData, accessToken, userId, cookies) {
  return apiFetch(`${DEPOP_API}/api/v2/products/${productId}/`, {
    method: "PUT",
    headers: {
      ...makeHeaders(accessToken, userId, cookies),
      Referer: `https://www.depop.com/products/edit/${productId}/`,
    },
    body: JSON.stringify(productData),
  });
}

export async function deleteProduct(productId, accessToken, userId, cookies) {
  return apiFetch(`${DEPOP_API}/api/v2/products/${productId}/`, {
    method: "DELETE",
    headers: makeHeaders(accessToken, userId, cookies),
  });
}

export async function getProduct(productId, accessToken, userId, cookies) {
  return apiFetch(`${DEPOP_API}/api/v2/product/userProductView/${productId}`, {
    headers: makeHeaders(accessToken, userId, cookies),
  });
}

// ─── User Listings ────────────────────────────────────────────────────────────

export async function getListings(accessToken, userId, cookies, statusFilter = "selling") {
  return apiFetch(
    `${DEPOP_API}/api/v1/shop/products/?limit=200&statusFilter=${statusFilter}`,
    { headers: makeHeaders(accessToken, userId, cookies) }
  );
}

// ─── Addresses ───────────────────────────────────────────────────────────────

export async function getAddresses(accessToken, userId, cookies) {
  return apiFetch(`${DEPOP_API}/api/v1/addresses/`, {
    headers: makeHeaders(accessToken, userId, cookies),
  });
}
