import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "cli.js");

function run(args, env = {}) {
  // Strip any ambient token from the parent shell FIRST, then apply this
  // call's explicit overrides — so a smoke test that passes
  // DEPOP_ACCESS_TOKEN actually keeps it. Doing this in the other order
  // silently deletes an override the caller just set.
  const cleanEnv = { ...process.env };
  delete cleanEnv.DEPOP_ACCESS_TOKEN;
  Object.assign(cleanEnv, env);
  // Point at a config file that can't exist, so tests never pick up the
  // owner's real ~/.vibelyster/depop.json by accident.
  cleanEnv.HOME = "/nonexistent-for-tests";
  return spawnSync("node", [CLI, ...args], { env: cleanEnv, encoding: "utf-8" });
}

test("prints help with core depop commands, no auth needed", () => {
  const result = run(["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /depop auth|Commands:/i);
  assert.match(result.stdout, /--json/);
});

test("auth without a token exits 1 with a usage message (no network call)", () => {
  const result = run(["auth"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Not logged in/);
});

test("auth --json without a token exits 1 with parseable JSON on stdout", () => {
  const result = run(["auth", "--json"]);
  assert.equal(result.status, 1);
  const doc = JSON.parse(result.stdout.trim());
  assert.match(doc.error, /Not logged in/);
});

test("listing without a slug exits 1 with the usage line (no network call)", () => {
  const result = run(["listing"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: depop listing <slug>/);
});

test("listing --json without a slug: parseable JSON error, still exit 1", () => {
  const result = run(["listing", "--json"]);
  assert.equal(result.status, 1);
  const doc = JSON.parse(result.stdout.trim());
  assert.equal(doc.error, "Usage: depop listing <slug>");
});

test("unknown command exits 1 and does not crash", () => {
  const result = run(["not-a-real-command"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown command/);
});

test("conversation without an id exits 1 with the usage line (no network call)", () => {
  const result = run(["conversation"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: depop conversation <id>/);
});

test("conversation --json without an id: parseable JSON error, still exit 1", () => {
  const result = run(["conversation", "--json"]);
  assert.equal(result.status, 1);
  const doc = JSON.parse(result.stdout.trim());
  assert.equal(doc.error, "Usage: depop conversation <id>");
});

// Gated live smoke test — never runs in CI. Exercises real read commands
// against the owner's own account. Never a write command here.
const liveEnabled = process.env.DEPOP_SMOKE === "1";
test("live smoke: auth --json against a real token", { skip: !liveEnabled }, () => {
  const result = run(["auth", "--json"], { DEPOP_ACCESS_TOKEN: process.env.DEPOP_ACCESS_TOKEN });
  const doc = JSON.parse(result.stdout.trim());
  assert.equal(result.status, 0);
  assert.equal(doc.loggedIn, true);
});

test("live smoke: inbox --json returns the real, normalized conversation list", { skip: !liveEnabled }, () => {
  const result = run(["inbox", "--json"], { DEPOP_ACCESS_TOKEN: process.env.DEPOP_ACCESS_TOKEN });
  const doc = JSON.parse(result.stdout.trim());
  assert.equal(result.status, 0);
  assert.ok(Array.isArray(doc.conversations));
  assert.ok(doc.conversations.length > 0);
  const c = doc.conversations[0];
  assert.ok("id" in c && "listing_id" in c && "buyer" in c);
  assert.ok("last_message_id" in c && "last_message_text" in c && "last_message_at" in c);
  assert.ok("last_message_from" in c && "unread" in c);
});

test("live smoke: inbox --unread --json only returns conversations whose last message is from the buyer", { skip: !liveEnabled }, () => {
  const result = run(["inbox", "--unread", "--json"], { DEPOP_ACCESS_TOKEN: process.env.DEPOP_ACCESS_TOKEN });
  const doc = JSON.parse(result.stdout.trim());
  assert.equal(result.status, 0);
  for (const c of doc.conversations) {
    assert.equal(c.unread, true);
    assert.equal(c.last_message_from, "buyer");
  }
});

test("live smoke: conversation --json returns a normalized, chronological thread for a real conversation", { skip: !liveEnabled }, () => {
  const inboxResult = run(["inbox", "--json"], { DEPOP_ACCESS_TOKEN: process.env.DEPOP_ACCESS_TOKEN });
  const firstId = JSON.parse(inboxResult.stdout.trim()).conversations[0].id;
  const result = run(["conversation", firstId, "--json"], { DEPOP_ACCESS_TOKEN: process.env.DEPOP_ACCESS_TOKEN });
  const doc = JSON.parse(result.stdout.trim());
  assert.equal(result.status, 0);
  assert.equal(doc.conversation.id, firstId);
  assert.ok("listing_id" in doc.conversation && "buyer" in doc.conversation);
  assert.ok(Array.isArray(doc.conversation.messages));
  for (const m of doc.conversation.messages) {
    assert.ok("id" in m && "from" in m && "text" in m && "at" in m);
    assert.ok(m.from === "buyer" || m.from === "seller");
  }
});
