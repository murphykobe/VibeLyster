import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

async function withTempConfig(fn) {
  const dir = await mkdtemp(join(tmpdir(), "ebay-cli-test-"));
  const configFile = join(dir, "ebay.json");
  const original = process.env.EBAY_CONFIG_FILE;
  process.env.EBAY_CONFIG_FILE = configFile;
  try {
    await fn(configFile);
  } finally {
    if (original === undefined) delete process.env.EBAY_CONFIG_FILE;
    else process.env.EBAY_CONFIG_FILE = original;
    await rm(dir, { recursive: true, force: true });
  }
}

test("getClient reports all missing required eBay env vars", async () => {
  const original = {
    EBAY_APP_ID: process.env.EBAY_APP_ID,
    EBAY_CERT_ID: process.env.EBAY_CERT_ID,
    EBAY_REFRESH_TOKEN: process.env.EBAY_REFRESH_TOKEN,
  };
  delete process.env.EBAY_APP_ID;
  delete process.env.EBAY_CERT_ID;
  delete process.env.EBAY_REFRESH_TOKEN;

  try {
    const { getClient, resetClientForTest } = await import("./ebay-api.js");
    resetClientForTest();
    assert.throws(
      () => getClient(),
      /Missing required environment variables: EBAY_APP_ID, EBAY_CERT_ID/
    );
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("saved OAuth credentials satisfy getClient without EBAY_REFRESH_TOKEN", async () => {
  await withTempConfig(async () => {
    const original = {
      EBAY_APP_ID: process.env.EBAY_APP_ID,
      EBAY_CERT_ID: process.env.EBAY_CERT_ID,
      EBAY_REFRESH_TOKEN: process.env.EBAY_REFRESH_TOKEN,
    };
    process.env.EBAY_APP_ID = "client-id";
    process.env.EBAY_CERT_ID = "client-secret";
    delete process.env.EBAY_REFRESH_TOKEN;

    try {
      const { getClient, resetClientForTest, saveAuthToken } = await import("./ebay-api.js");
      resetClientForTest();
      await saveAuthToken({
        access_token: "access",
        refresh_token: "refresh",
        token_type: "User Access Token",
        expires_in: 7200,
      });

      const client = getClient();
      assert.equal(client.OAuth2.getCredentials().refresh_token, "refresh");
    } finally {
      for (const [key, value] of Object.entries(original)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

test("generateLoginUrl uses the configured RuName and scopes", async () => {
  const original = {
    EBAY_APP_ID: process.env.EBAY_APP_ID,
    EBAY_CERT_ID: process.env.EBAY_CERT_ID,
    EBAY_RU_NAME: process.env.EBAY_RU_NAME,
    EBAY_REFRESH_TOKEN: process.env.EBAY_REFRESH_TOKEN,
  };
  process.env.EBAY_APP_ID = "client-id";
  process.env.EBAY_CERT_ID = "client-secret";
  process.env.EBAY_RU_NAME = "example-ru-name";
  delete process.env.EBAY_REFRESH_TOKEN;

  try {
    const { generateLoginUrl, resetClientForTest } = await import("./ebay-api.js");
    resetClientForTest();
    const url = new URL(generateLoginUrl());

    assert.equal(url.searchParams.get("client_id"), "client-id");
    assert.equal(url.searchParams.get("redirect_uri"), "example-ru-name");
    assert.match(url.searchParams.get("scope"), /sell\.inventory/);
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("resolveCondition maps supported listing condition aliases", async () => {
  const { resolveCondition } = await import("./ebay-api.js");

  assert.equal(resolveCondition("NEW"), "NEW");
  assert.equal(resolveCondition("new-other"), "NEW_OTHER");
  assert.equal(resolveCondition("USED_EXCELLENT"), "USED_EXCELLENT");
  assert.equal(resolveCondition("used_acceptable"), "USED_ACCEPTABLE");
});
