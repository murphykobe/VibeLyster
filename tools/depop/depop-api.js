/**
 * Depop Internal API Client
 *
 * Reverse-engineered from Flyp and Crosslist Chrome extensions.
 * Uses Depop's internal REST API with Bearer token auth.
 *
 * API Base: https://webapi.depop.com/
 * Auth: access_token from magic link login flow + user_id
 *
 * Magic link auth bypasses PerimeterX — the access_token is a clean JWT
 * obtained from Depop's legitimate login flow, no browser fingerprint needed.
 */

const DEPOP_API = "https://webapi.depop.com";
const DEPOP_WEB = "https://www.depop.com";

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

/**
 * Request a magic link email from Depop.
 * Depop sends an email with a "Log in to Depop" button containing a token URL.
 */
export async function requestMagicLink(email) {
  const res = await fetch(`${DEPOP_WEB}/api/auth/magic-link/`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
    body: JSON.stringify({ email }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to request magic link (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * Follow a magic link URL and extract the access_token from the redirect.
 * The magic link sets auth cookies — we capture them from Set-Cookie headers.
 */
export async function redeemMagicLink(magicLinkUrl) {
  // Follow the magic link but don't auto-redirect — capture cookies at each hop
  let currentUrl = magicLinkUrl;
  let accessToken = null;
  let userId = null;
  let allCookies = [];

  for (let i = 0; i < 10; i++) {
    const res = await fetch(currentUrl, {
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Cookie: allCookies.map((c) => `${c.name}=${c.value}`).join("; "),
      },
    });

    // Parse Set-Cookie headers
    const setCookies = res.headers.getSetCookie?.() || [];
    for (const raw of setCookies) {
      const [pair] = raw.split(";");
      const [name, ...valueParts] = pair.split("=");
      const value = valueParts.join("=");
      const trimName = name.trim();
      const trimValue = value.trim();

      // Update or add cookie
      const existing = allCookies.findIndex((c) => c.name === trimName);
      if (existing >= 0) {
        allCookies[existing].value = trimValue;
      } else {
        allCookies.push({ name: trimName, value: trimValue });
      }

      if (trimName === "access_token") accessToken = trimValue;
      if (trimName === "user_id") userId = trimValue;
    }

    // If we got the access_token, we're done
    if (accessToken && userId) break;

    // Follow redirect
    const location = res.headers.get("location");
    if (!location) break;

    // Handle relative URLs
    if (location.startsWith("/")) {
      const url = new URL(currentUrl);
      currentUrl = `${url.origin}${location}`;
    } else {
      currentUrl = location;
    }
  }

  if (!accessToken) {
    throw new Error(
      "Could not extract access_token from magic link. The link may be expired or already used."
    );
  }

  const cookieString = allCookies
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  return { accessToken, userId, cookies: cookieString };
}

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
