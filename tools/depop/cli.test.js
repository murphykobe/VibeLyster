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

// Gated live smoke test — never runs in CI. Exercises real read commands
// against the owner's own account. Never a write command here.
const liveEnabled = process.env.DEPOP_SMOKE === "1";
test("live smoke: auth --json against a real token", { skip: !liveEnabled }, () => {
  const result = run(["auth", "--json"], { DEPOP_ACCESS_TOKEN: process.env.DEPOP_ACCESS_TOKEN });
  const doc = JSON.parse(result.stdout.trim());
  assert.equal(result.status, 0);
  assert.equal(doc.loggedIn, true);
});
