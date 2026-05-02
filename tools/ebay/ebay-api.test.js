import assert from "node:assert/strict";
import test from "node:test";

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
      /Missing required environment variables: EBAY_APP_ID, EBAY_CERT_ID, EBAY_REFRESH_TOKEN/
    );
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
