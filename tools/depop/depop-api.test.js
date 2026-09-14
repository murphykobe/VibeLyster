import assert from "node:assert/strict";
import test from "node:test";
import {
  DepopApiError,
  classifyError,
  normalizeConversationSummary,
  normalizeConversationDetail,
} from "./depop-api.js";

// Mirrors grailed-api.test.js. classifyError is the single source of
// truth for depop-cli's exit-code contract.

test("classifyError: a real 401 from Depop's backend is TOKEN_EXPIRED", () => {
  const err = new DepopApiError("Depop API error 401: {...}", {
    status: 401,
    cloudflareBlock: false,
    body: { error: { message: "You must be logged in" } },
  });
  assert.deepEqual(classifyError(err), { exitCode: 3, key: "TOKEN_EXPIRED" });
});

test("classifyError: the branded Cloudflare/Depop 403 block page is CLOUDFLARE_BLOCK", () => {
  // Matches the real 2026-09-13 finding on /presentation/api/v1/pictures/:
  // a non-JSON, Depop-branded "Forbidden" HTML page, status 403, answered
  // before ever reaching Depop's backend.
  const err = new DepopApiError("Depop API error 403: ...", {
    status: 403,
    cloudflareBlock: true,
    body: "<!doctype html><title>Forbidden - Depop</title>...",
  });
  assert.deepEqual(classifyError(err), { exitCode: 4, key: "CLOUDFLARE_BLOCK" });
});

test("classifyError: an ordinary application error is exit 1 with its status", () => {
  const err = new DepopApiError("Depop API error 422: {...}", {
    status: 422,
    cloudflareBlock: false,
    body: { error: { message: "Invalid category" } },
  });
  assert.deepEqual(classifyError(err), { exitCode: 1, key: "API_ERROR", status: 422 });
});

test("classifyError: a non-DepopApiError (e.g. a file read failure) is a plain exit 1", () => {
  const err = new Error("ENOENT: no such file or directory");
  assert.deepEqual(classifyError(err), { exitCode: 1, key: "ERROR" });
});

test("DepopApiError preserves .message unchanged for anything reading only that", () => {
  const err = new DepopApiError("Depop API error 401: {\"foo\":1}", { status: 401 });
  assert.equal(err.message, "Depop API error 401: {\"foo\":1}");
  assert.equal(err.name, "DepopApiError");
});

// ─── normalizeConversationSummary / normalizeConversationDetail ────────────
//
// Fixtures are trimmed real shapes captured live 2026-09-14 (see the #50
// research and VibeLyster#53/#54 threads). My own account's id (3216414)
// appears as `user_id` on every conversation-list item and as
// `product.user_id` on every conversation detail — that's how "seller"
// vs "buyer" gets determined, there's no other self-identifying field.

const MY_USER_ID = 3216414;
const BUYER_ID = 208825853;

test("normalizeConversationSummary: last message from the seller is not unread", () => {
  const raw = {
    conversation_id: "a9e2e08bc54174314044eb18a7ff1a6d",
    user_id: MY_USER_ID,
    last_message_text: "Lowest I'll go is $120",
    last_message_timestamp: 1789327438,
    unread_count: 0,
    users: [{ id: 35231891, username: "lurkthestreet" }],
    product: { id: 909240036, user_id: MY_USER_ID },
  };
  const lastMessage = { id: "04BCA671-F2DA-44D8-833B-F2F746AE77CF", user_id: MY_USER_ID, text: "Lowest I'll go is $120", created_timestamp: 1789327438 };
  const result = normalizeConversationSummary(raw, lastMessage, MY_USER_ID);
  assert.equal(result.id, "a9e2e08bc54174314044eb18a7ff1a6d");
  assert.equal(result.listing_id, 909240036);
  assert.equal(result.buyer, "lurkthestreet");
  assert.equal(result.last_message_from, "seller");
  assert.equal(result.unread, false);
  assert.equal(result.last_message_at, new Date(1789327438 * 1000).toISOString());
});

test("normalizeConversationSummary: last message from the buyer is unread", () => {
  const raw = {
    conversation_id: "2e587a459534198170bce1cfc4a26ca2",
    user_id: MY_USER_ID,
    last_message_text: "Lowest?",
    last_message_timestamp: 1789323651,
    unread_count: 1,
    users: [{ id: BUYER_ID, username: "eyal_perten" }],
    product: { id: 909234927, user_id: MY_USER_ID },
  };
  const lastMessage = { id: "04C5B540-abc", user_id: BUYER_ID, text: "Lowest?", created_timestamp: 1789323651 };
  const result = normalizeConversationSummary(raw, lastMessage, MY_USER_ID);
  assert.equal(result.last_message_from, "buyer");
  assert.equal(result.unread, true);
});

test("normalizeConversationSummary: no messages fetched yet (e.g. fetch failed) — no last_message, reads as read (empty-inbox edge case)", () => {
  const raw = {
    conversation_id: "empty-convo",
    user_id: MY_USER_ID,
    last_message_text: null,
    last_message_timestamp: null,
    unread_count: 0,
    users: [{ id: BUYER_ID, username: "eyal_perten" }],
    product: { id: 1, user_id: MY_USER_ID },
  };
  const result = normalizeConversationSummary(raw, undefined, MY_USER_ID);
  assert.equal(result.last_message_id, null);
  assert.equal(result.last_message_from, null);
  assert.equal(result.unread, false);
});

test("normalizeConversationDetail: reverses newest-first messages into chronological order with correct seller/buyer attribution", () => {
  const conversation = {
    conversation_id: "de9315b5",
    user: { id: 498565874, username: "buyerhandle" },
    product: { id: 12345, user_id: MY_USER_ID },
    read_only: false,
  };
  // getMessages returns newest-first — this is the raw order the CLI passes in.
  const messagesNewestFirst = [
    { id: "D9F62A2C", user_id: MY_USER_ID, text: "pit to pit 21 inch neck to bottom 28.5 inch", created_timestamp: 1789171946 },
    { id: "FB88B425", user_id: 498565874, text: "May I have the chest measurement and neck to waist measurement?", created_timestamp: 1789052160 },
  ];
  assert.deepEqual(normalizeConversationDetail(conversation, messagesNewestFirst), {
    id: "de9315b5",
    listing_id: 12345,
    buyer: "buyerhandle",
    messages: [
      { id: "FB88B425", from: "buyer", text: "May I have the chest measurement and neck to waist measurement?", at: new Date(1789052160 * 1000).toISOString() },
      { id: "D9F62A2C", from: "seller", text: "pit to pit 21 inch neck to bottom 28.5 inch", at: new Date(1789171946 * 1000).toISOString() },
    ],
  });
});

test("normalizeConversationDetail: a conversation with no messages yet returns an empty messages array", () => {
  const conversation = { conversation_id: "x", user: { id: 1, username: "u" }, product: { id: 1, user_id: MY_USER_ID } };
  assert.deepEqual(normalizeConversationDetail(conversation, []), {
    id: "x",
    listing_id: 1,
    buyer: "u",
    messages: [],
  });
});
