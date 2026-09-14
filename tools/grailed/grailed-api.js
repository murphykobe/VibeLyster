/**
 * Grailed Internal API Client
 *
 * Reverse-engineered from Crosslist Chrome extension.
 * Uses Grailed's internal REST API with session cookie + CSRF token auth.
 * Requires `impit` for Chrome TLS fingerprint to bypass Cloudflare (see
 * apiFetch below) — bare Node fetch() now gets a hard Cloudflare block on
 * grailed.com, not just a stale-session error. Same fix depop-cli already
 * uses for the same reason.
 *
 * API Base: https://www.grailed.com/api/
 * Auth: csrf_token cookie + x-csrf-token header + session cookies
 * Brand Search: Algolia (public, no auth)
 */

import { Impit } from "impit";

const GRAILED_BASE = "https://www.grailed.com";
const GRAILED_API = `${GRAILED_BASE}/api`;
const GRAILED_S3 = "https://grailed-media.s3.amazonaws.com/";
const ALGOLIA_URL =
  "https://mnrwefss2q-dsn.algolia.net/1/indexes/Designer_production/query";
const ALGOLIA_PARAMS =
  "x-algolia-agent=Algolia&x-algolia-application-id=MNRWEFSS2Q&x-algolia-api-key=bc9ee1c014521ccf312525a4ef324a16";

const impit = new Impit({ browser: "chrome" });

function makeHeaders(csrfToken, version = "application/grailed.api.v1") {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-api-version": version,
    "x-csrf-token": csrfToken,
  };
}

/**
 * Thrown by apiFetch on any non-ok response. Carries structured
 * classification (status, whether Cloudflare's edge answered instead of
 * Grailed's backend) so callers — the CLI's exit-code contract — never
 * have to parse `.message` to tell "session expired" from "edge block"
 * from "an ordinary app error". `.message` itself is unchanged from
 * before this existed, so anything only reading `.message` still works.
 */
export class GrailedApiError extends Error {
  constructor(message, { status, cloudflareBlock = false, body } = {}) {
    super(message);
    this.name = "GrailedApiError";
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
      // Grailed's own backend always returns JSON, even for 401s (confirmed
      // 2026-09-13). A non-JSON body this large is Cloudflare's edge
      // answering on its own — a block or challenge page — before the
      // request ever reached Grailed's backend.
      detail = text;
      cloudflareBlock = true;
    }
    throw new GrailedApiError(
      `Grailed API error ${res.status}: ${JSON.stringify(detail)}`,
      { status: res.status, cloudflareBlock, body: detail }
    );
  }
  return res.json();
}

/**
 * Classifies any error from this module into the CLI's exit-code contract.
 * Exported so the CLI (and its tests) share one source of truth instead of
 * re-deriving it from error messages.
 */
export function classifyError(error) {
  if (error instanceof GrailedApiError) {
    if (error.cloudflareBlock) return { exitCode: 4, key: "CLOUDFLARE_BLOCK" };
    if (error.status === 401 || error.status === 403) {
      return { exitCode: 3, key: "SESSION_EXPIRED" };
    }
    return { exitCode: 1, key: "API_ERROR", status: error.status };
  }
  return { exitCode: 1, key: "ERROR" };
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
    // exitCode/key are additive — existing callers reading only
    // loggedIn/error see the same shape as before.
    return { loggedIn: false, error: e.message, ...classifyError(e) };
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

// ─── Drafts ─────────────────────────────────────────────────────────────────

export async function createDraft(draftData, csrfToken, cookies) {
  return apiFetch(`${GRAILED_API}/listing_drafts`, {
    method: "POST",
    headers: {
      ...makeHeaders(csrfToken),
      Cookie: cookies,
    },
    body: JSON.stringify(draftData),
  });
}

export async function updateDraft(draftId, draftData, csrfToken, cookies) {
  return apiFetch(`${GRAILED_API}/listing_drafts/${draftId}`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "accept-version": "v1",
      "x-csrf-token": csrfToken,
      Cookie: cookies,
    },
    body: JSON.stringify(draftData),
  });
}

export async function submitDraft(draftId, csrfToken, cookies) {
  return apiFetch(`${GRAILED_API}/listing_drafts/${draftId}/submit`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "accept-version": "v1",
      "x-csrf-token": csrfToken,
      Cookie: cookies,
    },
  });
}

export async function publishListing(listingData, csrfToken, cookies) {
  return apiFetch(`${GRAILED_API}/listings`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "accept-version": "v1",
      "x-csrf-token": csrfToken,
      Cookie: cookies,
    },
    body: JSON.stringify(listingData),
  });
}

export async function getDrafts(page, csrfToken, cookies) {
  return apiFetch(`${GRAILED_API}/listing_drafts?page=${page}`, {
    headers: {
      ...makeHeaders(csrfToken),
      Cookie: cookies,
    },
  });
}

export async function deleteDraft(draftId, csrfToken, cookies) {
  return apiFetch(`${GRAILED_API}/listing_drafts/${draftId}`, {
    method: "DELETE",
    headers: {
      ...makeHeaders(csrfToken),
      Cookie: cookies,
    },
  });
}

// ─── Listings ───────────────────────────────────────────────────────────────

export async function editListing(listingId, listingData, csrfToken, cookies) {
  return apiFetch(`${GRAILED_API}/listings/${listingId}`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "accept-version": "v1",
      "x-csrf-token": csrfToken,
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

// ─── Conversations (inbox) ───────────────────────────────────────────────────
//
// Endpoints below were found by reading Grailed's own frontend bundles
// (Next.js chunks + the legacy grailed-bundles.prod.goateng.com messaging
// bundle) on 2026-09-14 against a live session, not by trial-and-error
// against the API. Only GET endpoints are wired up here — see the TODO
// below for the write endpoints (reply, accept, counter), which are
// documented but intentionally NOT implemented yet.

export async function getConversations(csrfToken, cookies, { page, context, archived } = {}) {
  const params = new URLSearchParams();
  if (page != null) params.set("page", page);
  if (context != null) params.set("context", context);
  if (archived != null) params.set("archived", archived);
  const qs = params.toString();
  return apiFetch(`${GRAILED_API}/conversations${qs ? `?${qs}` : ""}`, {
    headers: {
      ...makeHeaders(csrfToken),
      Cookie: cookies,
    },
  });
}

export async function getConversation(conversationId, csrfToken, cookies) {
  return apiFetch(`${GRAILED_API}/conversations/${conversationId}`, {
    headers: {
      ...makeHeaders(csrfToken),
      Cookie: cookies,
    },
  });
}

export async function getUnreadCounts(csrfToken, cookies) {
  return apiFetch(`${GRAILED_API}/conversations/unread_counts`, {
    headers: {
      ...makeHeaders(csrfToken),
      Cookie: cookies,
    },
  });
}

// TODO(#49 hand-verify before implementing): write endpoints found in the
// frontend bundle but NOT wired up here, since exercising them touches a
// real buyer or a real pending offer on the owner's live account:
//   - POST /api/offers  { listing_id, amount, body, conversation_id }
//     Sends a counter-offer. `amount` may be Grailed's only way to send a
//     PLAIN reply too (no separate "send message" endpoint was found
//     anywhere in either bundle) — unconfirmed, needs a hand test with a
//     real conversation.
//   - POST /api/offers/accept  { listingId, amount, conversationId }
//   - POST /api/binding_offers/:id  { listingId, amount, accept: "true" }
//     Accept variant for "binding" offers specifically.
//   - No decline endpoint exists anywhere in either bundle. Offers appear
//     to only expire (see `expires_at`/`voided` on the offer object) or
//     get superseded by a counter-offer — there may be no explicit
//     "decline" action on Grailed at all.
//   - POST /api/conversations/:id/mark_as_read, /archive, /unarchive also
//     exist and are low-risk, but left out for now to keep this change
//     strictly read-only per #40/#41.
