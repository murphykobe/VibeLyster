import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";

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

test("live smoke: inbox --json returns the real conversation list", { skip: !liveEnabled }, () => {
  const result = run(["inbox", "--json"], {
    GRAILED_CSRF_TOKEN: process.env.GRAILED_CSRF_TOKEN,
    GRAILED_COOKIES: process.env.GRAILED_COOKIES,
  });
  const doc = JSON.parse(result.stdout.trim());
  assert.equal(result.status, 0);
  assert.ok(Array.isArray(doc.conversations));
  assert.ok(doc.conversations.length > 0);
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

test("live smoke: conversation --json returns a full activity log for a real thread", { skip: !liveEnabled }, () => {
  const inboxResult = run(["inbox", "--json"], {
    GRAILED_CSRF_TOKEN: process.env.GRAILED_CSRF_TOKEN,
    GRAILED_COOKIES: process.env.GRAILED_COOKIES,
  });
  const firstId = JSON.parse(inboxResult.stdout.trim()).conversations[0].id;
  const result = run(["conversation", String(firstId), "--json"], {
    GRAILED_CSRF_TOKEN: process.env.GRAILED_CSRF_TOKEN,
    GRAILED_COOKIES: process.env.GRAILED_COOKIES,
  });
  const doc = JSON.parse(result.stdout.trim());
  assert.equal(result.status, 0);
  assert.equal(doc.conversation.id, firstId);
  assert.ok(Array.isArray(doc.conversation.activity_log));
});
