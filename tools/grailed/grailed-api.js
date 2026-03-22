/**
 * Grailed Internal API Client
 *
 * Reverse-engineered from Crosslist Chrome extension.
 * Uses Grailed's internal REST API with session cookie + CSRF token auth.
 *
 * API Base: https://www.grailed.com/api/
 * Auth: csrf_token cookie + x-csrf-token header + session cookies
 * Brand Search: Algolia (public, no auth)
 */

const GRAILED_BASE = "https://www.grailed.com";
const GRAILED_API = `${GRAILED_BASE}/api`;
const GRAILED_S3 = "https://grailed-media.s3.amazonaws.com/";
const ALGOLIA_URL =
  "https://mnrwefss2q-dsn.algolia.net/1/indexes/Designer_production/query";
const ALGOLIA_PARAMS =
  "x-algolia-agent=Algolia&x-algolia-application-id=MNRWEFSS2Q&x-algolia-api-key=bc9ee1c014521ccf312525a4ef324a16";

function makeHeaders(csrfToken) {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-api-version": "application/grailed.api.v1",
    "x-csrf-token": csrfToken,
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
    throw new Error(
      `Grailed API error ${res.status}: ${JSON.stringify(detail)}`
    );
  }
  return res.json();
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function getMe(csrfToken, cookies) {
  return apiFetch(`${GRAILED_API}/users/me`, {
    headers: {
      ...makeHeaders(csrfToken),
      Cookie: cookies,
    },
  });
}

export async function checkLogin(csrfToken, cookies) {
  try {
    const me = await getMe(csrfToken, cookies);
    return { loggedIn: true, user: me.data };
  } catch (e) {
    return { loggedIn: false, error: e.message };
  }
}

// ─── Categories ──────────────────────────────────────────────────────────────

export async function getCategories() {
  return apiFetch(`${GRAILED_API}/config/categories`);
}

// ─── Brand Search (Algolia — public, no auth) ───────────────────────────────

export async function searchBrand(query, department = "menswear") {
  const res = await fetch(`${ALGOLIA_URL}?${ALGOLIA_PARAMS}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: JSON.stringify({
      params: `query=${encodeURIComponent(query)}&page=0&hitsPerPage=5&filters=departments:${department}`,
    }),
  });
  const data = await res.json();
  if (!data.hits || data.hits.length === 0) return null;
  return data.hits.map((h) => ({
    id: h.id,
    name: h.name,
    slug: h.slug,
    departments: h.departments,
    logo_url: h.logo_url,
  }));
}

// ─── Image Upload (presigned S3) ─────────────────────────────────────────────

export async function uploadImage(imagePath, csrfToken, cookies) {
  // Step 1: Get presigned URL
  const presign = await apiFetch(`${GRAILED_API}/photos/presign/listing`, {
    headers: {
      ...makeHeaders(csrfToken),
      Cookie: cookies,
    },
  });

  // Step 2: Read image file
  const { readFile } = await import("node:fs/promises");
  const imageBuffer = await readFile(imagePath);
  const blob = new Blob([imageBuffer], { type: "image/jpeg" });

  // Step 3: Upload to S3 with presigned fields
  const form = new FormData();
  for (const [key, val] of Object.entries(presign.data.fields)) {
    form.append(key, val);
  }
  form.append("Content-Type", "image/jpeg");
  form.append("file", blob, "photo.jpg");

  const s3Res = await fetch(GRAILED_S3, {
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
    throw new Error(`S3 upload failed ${s3Res.status}: ${text}`);
  }

  return presign.data.image_url;
}

// ─── Listings CRUD ───────────────────────────────────────────────────────────

export async function createListing(listingData, csrfToken, cookies) {
  return apiFetch(`${GRAILED_API}/listings`, {
    method: "POST",
    headers: {
      ...makeHeaders(csrfToken),
      Cookie: cookies,
    },
    body: JSON.stringify(listingData),
  });
}

export async function updateListing(listingId, listingData, csrfToken, cookies) {
  return apiFetch(`${GRAILED_API}/listings/${listingId}`, {
    method: "PUT",
    headers: {
      ...makeHeaders(csrfToken),
      Cookie: cookies,
    },
    body: JSON.stringify(listingData),
  });
}

export async function deleteListing(listingId, csrfToken, cookies) {
  return apiFetch(`${GRAILED_API}/listings/${listingId}`, {
    method: "DELETE",
    headers: {
      ...makeHeaders(csrfToken),
      Cookie: cookies,
    },
  });
}

export async function getListing(listingId) {
  return apiFetch(`${GRAILED_API}/listings/${listingId}`);
}

// ─── Wardrobe (user's listings) ──────────────────────────────────────────────

export async function getWardrobe(userId, page = 1, limit = 99, cookies) {
  const url = `${GRAILED_API}/users/${userId}/wardrobe?page=${page}&limit=${limit}`;
  const options = cookies ? { headers: { Cookie: cookies } } : {};
  return apiFetch(url, options);
}

// ─── User Addresses ──────────────────────────────────────────────────────────

export async function getAddresses(userId, csrfToken, cookies) {
  return apiFetch(`${GRAILED_API}/users/${userId}/postal_addresses`, {
    headers: {
      ...makeHeaders(csrfToken),
      Cookie: cookies,
    },
  });
}
