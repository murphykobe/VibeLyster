import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function runCli(args, env = {}) {
  return spawnSync(process.execPath, ["cli.js", ...args], {
    cwd: new URL(".", import.meta.url),
    encoding: "utf-8",
    env: {
      PATH: process.env.PATH,
      ...env,
    },
  });
}

test("prints help with core eBay commands", () => {
  const result = runCli(["--help"]);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /eBay CLI/);
  assert.match(result.stdout, /categories <query>/);
  assert.match(result.stdout, /create <json-file>/);
  assert.match(result.stdout, /publish <offerId>/);
});

test("auth exits with a useful error when env vars are missing", () => {
  const result = runCli(["auth"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing required environment variables/);
  assert.match(result.stderr, /EBAY_APP_ID/);
  assert.match(result.stderr, /EBAY_CERT_ID/);
  assert.match(result.stderr, /EBAY_REFRESH_TOKEN/);
});
