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
  assert.match(result.stdout, /login/);
  assert.match(result.stdout, /logout/);
  assert.match(result.stdout, /categories <query>/);
  assert.match(result.stdout, /active/);
  assert.match(result.stdout, /create <json-file>/);
  assert.match(result.stdout, /publish <offerId>/);
});

test("login prints a consent URL when RuName is configured", () => {
  const result = runCli(["login"], {
    EBAY_APP_ID: "client-id",
    EBAY_CERT_ID: "client-secret",
    EBAY_RU_NAME: "example-ru-name",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Open this URL/);
  assert.match(result.stdout, /client_id=client-id/);
  assert.match(result.stdout, /redirect_uri=example-ru-name/);
  assert.match(result.stdout, /state=cli-/);
  assert.match(result.stdout, /ebay login/);
});

test("logout succeeds when no saved credentials exist", () => {
  const result = runCli(["logout"], {
    EBAY_CONFIG_FILE: "/tmp/vibelyster-ebay-cli-test-missing.json",
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Logged out/);
});

test("auth exits with a useful error when env vars are missing", () => {
  const result = runCli(["auth"]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing required environment variables/);
  assert.match(result.stderr, /EBAY_APP_ID/);
  assert.match(result.stderr, /EBAY_CERT_ID/);
});
