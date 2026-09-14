import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { getConversations } from "./grailed-api.js";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "cli.js");

function run(args, env = {}) {
  // Strip ambient credentials from the parent shell FIRST, then apply
  // this call's explicit overrides — so a smoke test that passes
  // GRAILED_CSRF_TOKEN/GRAILED_COOKIES actually keeps them. The reverse
  // order silently deletes an override the caller just set (caught
  // 2026-09-14 running the Depop counterpart of this same helper live).
  const cleanEnv = { ...process.env };
  delete cleanEnv.GRAILED_CSRF_TOKEN;
  delete cleanEnv.GRAILED_COOKIES;
  Object.assign(cleanEnv, env);
  return spawnSync("node", [CLI, ...args], { env: cleanEnv, encoding: "utf-8" });
}

test("prints help with core grailed commands, no auth needed", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /grailed auth|Commands:/i);
  assert.match(result.stdout, /--json/);
});

test("auth without credentials exits 1 with a usage message (no network call)", () => {
  const result = run(["auth"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Authentication required/);
});

test("auth --json without credentials exits 1 with parseable JSON on stdout", () => {
  const result = run(["auth", "--json"]);
  assert.equal(result.status, 1);
  const doc = JSON.parse(result.stdout.trim());
  assert.match(doc.error, /Authentication required/);
});

test("listing without an id exits 1 with the usage line (no network call)", () => {
  const result = run(["listing"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: grailed listing <id>/);
});

test("listing --json without an id: parseable JSON error, still exit 1", () => {
  const result = run(["listing", "--json"]);
  assert.equal(result.status, 1);
  const doc = JSON.parse(result.stdout.trim());
  assert.equal(doc.error, "Usage: grailed listing <id>");
});

test("unknown command exits 1 and does not crash", () => {
  const result = run(["not-a-real-command"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown command/);
});

test("unknown command --json emits parseable JSON", () => {
  const result = run(["not-a-real-command", "--json"]);
  assert.equal(result.status, 1);
  const doc = JSON.parse(result.stdout.trim());
  assert.match(doc.error, /Unknown command/);
});

test("conversation without an id exits 1 with the usage line (no network call)", () => {
  const result = run(["conversation"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: grailed conversation <id>/);
});

test("conversation --json without an id: parseable JSON error, still exit 1", () => {
  const result = run(["conversation", "--json"]);
  assert.equal(result.status, 1);
  const doc = JSON.parse(result.stdout.trim());
  assert.equal(doc.error, "Usage: grailed conversation <id>");
});

// Gated live smoke test — never runs in CI. Exercises real read commands
// against the owner's own account. Never a write command here.
const liveEnabled = process.env.GRAILED_SMOKE === "1";
test("live smoke: auth --json against a real session", { skip: !liveEnabled }, () => {
  const result = run(["auth", "--json"], {
    GRAILED_CSRF_TOKEN: process.env.GRAILED_CSRF_TOKEN,
    GRAILED_COOKIES: process.env.GRAILED_COOKIES,
  });
  const doc = JSON.parse(result.stdout.trim());
  assert.equal(result.status, 0);
  assert.equal(doc.loggedIn, true);
});

// This account has 700+ conversations across 90+ pages — an unbounded
// `inbox` walks all of them, which is slow and (reproduced live,
// 2026-09-14) risks tripping Cloudflare's rate limiting on the rapid
// sequential requests. --since bounds every live-test call here to a
// recent window, mirroring how the agent actually calls this command
// (--since <last_run>) and keeping this suite fast and block-safe.
const recentSince = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

test("live smoke: inbox --json returns the real conversation list", { skip: !liveEnabled }, () => {
  const result = run(["inbox", "--since", recentSince(), "--json"], {
    GRAILED_CSRF_TOKEN: process.env.GRAILED_CSRF_TOKEN,
    GRAILED_COOKIES: process.env.GRAILED_COOKIES,
  });
  const doc = JSON.parse(result.stdout.trim());
  assert.equal(result.status, 0);
  assert.ok(Array.isArray(doc.conversations));
  assert.ok(doc.conversations.length > 0);
  // Normalized shape per #44, not Grailed's raw nested shape.
  const c = doc.conversations[0];
  assert.ok("id" in c && "listing_id" in c && "buyer" in c);
  assert.ok("last_message_id" in c && "last_message_text" in c && "last_message_at" in c);
  assert.ok("last_message_from" in c && "unread" in c);
});

test("live smoke: inbox --unread --json only returns conversations whose last message is from the buyer", { skip: !liveEnabled }, () => {
  const result = run(["inbox", "--since", recentSince(), "--unread", "--json"], {
    GRAILED_CSRF_TOKEN: process.env.GRAILED_CSRF_TOKEN,
    GRAILED_COOKIES: process.env.GRAILED_COOKIES,
  });
  const doc = JSON.parse(result.stdout.trim());
  assert.equal(result.status, 0);
  for (const c of doc.conversations) {
    assert.equal(c.unread, true);
    assert.equal(c.last_message_from, "buyer");
  }
});

test("live smoke: offers --json returns the real pending-offers shape (possibly empty)", { skip: !liveEnabled }, () => {
  const result = run(["offers", "--json"], {
    GRAILED_CSRF_TOKEN: process.env.GRAILED_CSRF_TOKEN,
    GRAILED_COOKIES: process.env.GRAILED_COOKIES,
  });
  const doc = JSON.parse(result.stdout.trim());
  assert.equal(result.status, 0);
  assert.ok(Array.isArray(doc.offers));
});

test("live smoke: conversation --json returns a full activity log for a real thread", { skip: !liveEnabled }, async () => {
  // Deliberately bypasses `inbox` here (and its --since bound) — this
  // test only needs some real conversation id, and page 1 alone is
  // always non-empty and always exactly one request either way.
  const page1 = await getConversations(process.env.GRAILED_CSRF_TOKEN, process.env.GRAILED_COOKIES, { page: 1 });
  const firstId = page1.data[0].id;
  const result = run(["conversation", String(firstId), "--json"], {
    GRAILED_CSRF_TOKEN: process.env.GRAILED_CSRF_TOKEN,
    GRAILED_COOKIES: process.env.GRAILED_COOKIES,
  });
  const doc = JSON.parse(result.stdout.trim());
  assert.equal(result.status, 0);
  assert.equal(doc.conversation.id, firstId);
  // Normalized shape per #45, not Grailed's raw activity_log.
  assert.ok("listing_id" in doc.conversation && "buyer" in doc.conversation);
  assert.ok(Array.isArray(doc.conversation.messages));
  for (const m of doc.conversation.messages) {
    assert.ok("id" in m && "from" in m && "text" in m && "at" in m);
    assert.ok(m.from === "buyer" || m.from === "seller");
  }
});
