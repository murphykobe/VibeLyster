import assert from "node:assert/strict";
import test from "node:test";
import {
  GrailedApiError,
  classifyError,
  normalizeConversationSummary,
  normalizeConversationDetail,
} from "./grailed-api.js";

// classifyError is the single source of truth for the CLI's exit-code
// contract (0 success / 1 error / 3 SESSION_EXPIRED / 4 CLOUDFLARE_BLOCK).
// These are pure, network-free tests against constructed errors — the
// real network behavior they encode was verified manually on 2026-09-13:
// a 401 with a JSON body reaches Grailed's real backend (SESSION_EXPIRED);
// a non-JSON (HTML) body means Cloudflare's edge answered instead
// (CLOUDFLARE_BLOCK), regardless of status code.

test("classifyError: a real 401 from Grailed's backend is SESSION_EXPIRED", () => {
  const err = new GrailedApiError("Grailed API error 401: {...}", {
    status: 401,
    cloudflareBlock: false,
    body: { error: { message: "You must be logged in" } },
  });
  assert.deepEqual(classifyError(err), { exitCode: 3, key: "SESSION_EXPIRED" });
});

test("classifyError: a real 403 from Grailed's backend is also SESSION_EXPIRED", () => {
  const err = new GrailedApiError("Grailed API error 403: {...}", {
    status: 403,
    cloudflareBlock: false,
    body: { error: { message: "Forbidden" } },
  });
  assert.deepEqual(classifyError(err), { exitCode: 3, key: "SESSION_EXPIRED" });
});

test("classifyError: an HTML block page is CLOUDFLARE_BLOCK even when status is 403", () => {
  // Matches the real 2026-09-13 finding: Cloudflare answers grailed.com's
  // own API path with a 403 whose body is an HTML "Attention Required!"
  // page, not JSON — same status code as a real auth failure, so the
  // body shape (not the status) is what has to disambiguate.
  const err = new GrailedApiError("Grailed API error 403: ...", {
    status: 403,
    cloudflareBlock: true,
    body: "<!doctype html><title>Attention Required! | Cloudflare</title>...",
  });
  assert.deepEqual(classifyError(err), { exitCode: 4, key: "CLOUDFLARE_BLOCK" });
});

test("classifyError: an ordinary application error (e.g. 422) is exit 1 with its status", () => {
  const err = new GrailedApiError("Grailed API error 422: {...}", {
    status: 422,
    cloudflareBlock: false,
    body: { error: { message: "Invalid category" } },
  });
  assert.deepEqual(classifyError(err), { exitCode: 1, key: "API_ERROR", status: 422 });
});

test("classifyError: a non-GrailedApiError (e.g. a file read failure) is a plain exit 1", () => {
  const err = new Error("ENOENT: no such file or directory");
  assert.deepEqual(classifyError(err), { exitCode: 1, key: "ERROR" });
});

test("GrailedApiError preserves .message unchanged for anything reading only that", () => {
  const err = new GrailedApiError("Grailed API error 401: {\"foo\":1}", { status: 401 });
  assert.equal(err.message, "Grailed API error 401: {\"foo\":1}");
  assert.equal(err.name, "GrailedApiError");
});

// ─── normalizeConversationSummary / normalizeConversationDetail ────────────
//
// Fixtures below are trimmed real shapes captured live 2026-09-14 (see
// PR #59 and the VibeLyster#44/#45 issue threads), not invented — Grailed
// mixes message/offer/bot_message entries in one activity_log with the
// buyer keyed off `interlocutor` and the seller keyed off
// `listing.seller_id`, which is what these fixtures exercise.

const SELLER_ID = 16253;
const BUYER_ID = 3819707;

test("normalizeConversationSummary: a conversation with only a bot_message has no last_message and reads as read (empty-inbox edge case)", () => {
  const raw = {
    id: 183698994,
    listing: { id: 105844141, seller_id: SELLER_ID, buyer_id: null },
    interlocutor: { id: BUYER_ID, username: "Newlifehard" },
    activity_log: [
      { id: 651993420, type: "bot_message", created_at: "2026-09-14T00:28:10.949Z", message: "Measurements added.", sender_id: BUYER_ID },
    ],
  };
  assert.deepEqual(normalizeConversationSummary(raw), {
    id: 183698994,
    listing_id: 105844141,
    buyer: "Newlifehard",
    last_message_id: null,
    last_message_text: null,
    last_message_at: null,
    last_message_from: null,
    unread: false,
  });
});

test("normalizeConversationSummary: last message from the buyer is unread", () => {
  const raw = {
    id: 183665584,
    listing: { id: 105792270, seller_id: SELLER_ID },
    interlocutor: { id: BUYER_ID, username: "kaylasy" },
    activity_log: [
      { id: 651891926, type: "message", created_at: "2026-09-13T06:52:32.341Z", message: "I bought them, please send them today", sender_id: BUYER_ID },
      { id: 651892343, type: "bot_message", created_at: "2026-09-13T06:58:31.859Z", message: "You have fully refunded the buyer $112.99.", sender_id: BUYER_ID },
    ],
  };
  const result = normalizeConversationSummary(raw);
  assert.equal(result.last_message_from, "buyer");
  assert.equal(result.unread, true);
  assert.equal(result.last_message_id, 651891926);
  assert.equal(result.last_message_text, "I bought them, please send them today");
});

test("normalizeConversationSummary: last message from the seller is not unread", () => {
  const raw = {
    id: 183665584,
    listing: { id: 105792270, seller_id: SELLER_ID },
    interlocutor: { id: BUYER_ID, username: "kaylasy" },
    activity_log: [
      { id: 651892149, type: "message", created_at: "2026-09-13T06:56:09.701Z", message: "Just make sure you read descriptions.", sender_id: SELLER_ID },
    ],
  };
  const result = normalizeConversationSummary(raw);
  assert.equal(result.last_message_from, "seller");
  assert.equal(result.unread, false);
});

test("normalizeConversationDetail: interleaves seller/buyer turns in order, dropping offer and bot_message entries", () => {
  const raw = {
    id: 183665584,
    listing: { id: 105792270, seller_id: SELLER_ID },
    interlocutor: { id: BUYER_ID, username: "kaylasy" },
    activity_log: [
      { id: 651891360, type: "message", created_at: "2026-09-13T06:44:03.762Z", message: "Hi, what is your minimum price?", sender_id: BUYER_ID },
      { id: 206680014, type: "offer", created_at: "2026-09-13T06:46:27.077Z", amount: 60, sender_id: BUYER_ID },
      { id: 651891502, type: "bot_message", created_at: "2026-09-13T06:46:27.450Z", message: "You have a new binding offer!", sender_id: BUYER_ID },
      { id: 651892149, type: "message", created_at: "2026-09-13T06:56:09.701Z", message: "Just make sure you read descriptions.", sender_id: SELLER_ID },
    ],
  };
  assert.deepEqual(normalizeConversationDetail(raw), {
    id: 183665584,
    listing_id: 105792270,
    buyer: "kaylasy",
    messages: [
      { id: 651891360, from: "buyer", text: "Hi, what is your minimum price?", at: "2026-09-13T06:44:03.762Z" },
      { id: 651892149, from: "seller", text: "Just make sure you read descriptions.", at: "2026-09-13T06:56:09.701Z" },
    ],
  });
});

test("normalizeConversationDetail: a conversation with no plain messages yet returns an empty messages array", () => {
  const raw = {
    id: 183698994,
    listing: { id: 105844141, seller_id: SELLER_ID },
    interlocutor: { id: BUYER_ID, username: "Newlifehard" },
    activity_log: [
      { id: 651993420, type: "bot_message", created_at: "2026-09-14T00:28:10.949Z", message: "Measurements added.", sender_id: BUYER_ID },
    ],
  };
  assert.deepEqual(normalizeConversationDetail(raw), {
    id: 183698994,
    listing_id: 105844141,
    buyer: "Newlifehard",
    messages: [],
  });
});
