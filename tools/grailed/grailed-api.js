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

/**
 * Flattens a raw /api/conversations list item down to the stable shape
 * VibeLyster#44 specifies, so the agent never has to know Grailed's
 * internal (nested, mixed message/offer/bot_message) shape. "Unread" is
 * computed, not taken from Grailed's own `is_read` — #44 defines it as
 * "last message is from the buyer and unanswered," which is exactly
 * "the last `message`-type activity_log entry wasn't sent by the seller."
 */
export function normalizeConversationSummary(raw) {
  const sellerId = raw.listing?.seller_id;
  const lastMessage = [...(raw.activity_log || [])].reverse().find((a) => a.type === "message");
  const from = lastMessage ? (lastMessage.sender_id === sellerId ? "seller" : "buyer") : null;
  return {
    id: raw.id,
    listing_id: raw.listing?.id ?? null,
    buyer: raw.interlocutor?.username ?? null,
    last_message_id: lastMessage?.id ?? null,
    last_message_text: lastMessage?.message ?? null,
    last_message_at: lastMessage?.created_at ?? null,
    last_message_from: from,
    unread: from === "buyer",
  };
}

/**
 * Flattens a raw /api/conversations/:id detail down to the stable shape
 * VibeLyster#45 specifies. Only `type: "message"` activity_log entries
 * become messages — `offer` and `bot_message` entries are Grailed-system
 * events, not chat turns, and don't fit the {id, from, text, at} shape
 * (an offer has no `text`; #46 covers offers separately).
 */
export function normalizeConversationDetail(raw) {
  const sellerId = raw.listing?.seller_id;
  const messages = (raw.activity_log || [])
    .filter((a) => a.type === "message")
    .map((a) => ({
      id: a.id,
      from: a.sender_id === sellerId ? "seller" : "buyer",
      text: a.message,
      at: a.created_at,
    }));
  return {
    id: raw.id,
    listing_id: raw.listing?.id ?? null,
    buyer: raw.interlocutor?.username ?? null,
    messages,
  };
}

export async function getUnreadCounts(csrfToken, cookies) {
  return apiFetch(`${GRAILED_API}/conversations/unread_counts`, {
    headers: {
      ...makeHeaders(csrfToken),
      Cookie: cookies,
    },
  });
}

/**
 * All pending offers across every conversation, in one call — verified
 * live 2026-09-14 (200, `{data: [...]}` shape). Cheaper than paging
 * through every conversation just to find the ones with a live offer.
 *
 * TODO(#46 reopened): the endpoint has only ever returned an empty array
 * live (no pending offers existed on the test account at the time), so
 * the per-offer field names are unconfirmed. #46 wants a normalized
 * {id, listing_id, buyer, amount, ask_price, status, created_at,
 * expires_at} shape with `ask_price` fetched via getListing() if not
 * present directly, plus a --pending filter — none of that is built yet,
 * since building a normalizer against zero real examples is exactly the
 * kind of guess this session has been avoiding. Needs a real pending
 * offer on the account to verify field names against before this can be
 * normalized and closed out for real.
 */
export async function getPendingOffers(userId, csrfToken, cookies) {
  return apiFetch(`${GRAILED_API}/users/${userId}/offers/pending`, {
    headers: {
      ...makeHeaders(csrfToken),
      Cookie: cookies,
    },
  });
}

// ─── Reply / Counter-offer ────────────────────────────────────────────────
//
// #41/#47/#48: two SEPARATE write endpoints, not one shared one — an
// earlier hypothesis that /api/offers doubled as the reply endpoint was
// wrong (confirmed live 2026-09-14: amount: null 400s there — the
// endpoint is offer-only, always wants a real numeric amount) and static
// analysis of both frontend bundles never found a reply endpoint at all.
// Resolved with a real DevTools "Copy as cURL" capture of an actual send
// from the owner's own browser:
//
//   POST /api/conversations  { body, listing_id, conversation_id, type: "reply" }
//
// `type: "reply"` is a discriminator on the SAME bare /api/conversations
// path already used for the GET list — a plain POST there was never
// tried before this capture, since grep only surfaces string literals,
// not "what verb does some other caller use on an already-found path".
//
// `accept` is deliberately NOT implemented — out of scope for now, stays
// owner-only via the Grailed website itself. `decline` does not exist:
// re-checked against all 24 chunks of /sell/offers (not just the 2 first
// found), zero matches for "decline" and zero offer-scoped "reject" —
// only generic Promise.reject noise. Grailed's model is accept, counter,
// or let the offer expire (`expires_at`/`voided` on the offer object);
// there is no distinct decline action to map.
export async function sendReply(listingId, conversationId, text, csrfToken, cookies) {
  return apiFetch(`${GRAILED_API}/conversations`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "accept-version": "v1",
      "x-csrf-token": csrfToken,
      Cookie: cookies,
    },
    body: JSON.stringify({ body: text, listing_id: listingId, conversation_id: conversationId, type: "reply" }),
  });
}

/** Counter-offer — verified shape from the original /sell/offers bundle
 * find, distinct from sendReply above. `amount` must be a real number;
 * this endpoint 400s on null (confirmed live). */
export async function sendCounterOffer(listingId, amount, body, conversationId, csrfToken, cookies) {
  return apiFetch(`${GRAILED_API}/offers`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "accept-version": "v1",
      "x-csrf-token": csrfToken,
      Cookie: cookies,
    },
    body: JSON.stringify({ listing_id: listingId, amount, body, conversation_id: conversationId }),
  });
}
