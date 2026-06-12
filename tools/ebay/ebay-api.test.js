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

test("resolveCondition maps all supported eBay condition enums", async () => {
  const { resolveCondition } = await import("./ebay-api.js");

  assert.equal(resolveCondition("NEW"), "NEW");
  assert.equal(resolveCondition("new-other"), "NEW_OTHER");
  assert.equal(resolveCondition("NEW_WITH_DEFECTS"), "NEW_WITH_DEFECTS");
  assert.equal(resolveCondition("USED_EXCELLENT"), "USED_EXCELLENT");
  assert.equal(resolveCondition("used-very-good"), "USED_VERY_GOOD");
  assert.equal(resolveCondition("used_good"), "USED_GOOD");
  assert.equal(resolveCondition("used_acceptable"), "USED_ACCEPTABLE");

  assert.throws(() => resolveCondition("FAKE_CONDITION"), /Unknown condition/);
});

test("buildInventoryItemPayload produces correct structure", async () => {
  const { buildInventoryItemPayload } = await import("./ebay-api.js");

  const payload = buildInventoryItemPayload({
    title: "Test Sneakers",
    description: "Great shoes",
    condition: "USED_EXCELLENT",
    quantity: 2,
    images: ["https://example.com/img.jpg"],
    aspects: { Brand: ["Nike"], Color: ["Black"] },
  });

  assert.equal(payload.product.title, "Test Sneakers");
  assert.equal(payload.product.description, "Great shoes");
  assert.deepEqual(payload.product.imageUrls, ["https://example.com/img.jpg"]);
  assert.deepEqual(payload.product.aspects, { Brand: ["Nike"], Color: ["Black"] });
  assert.equal(payload.condition, "USED_EXCELLENT");
  assert.equal(payload.availability.shipToLocationAvailability.quantity, 2);
});

test("buildInventoryItemPayload defaults quantity to 1", async () => {
  const { buildInventoryItemPayload } = await import("./ebay-api.js");

  const payload = buildInventoryItemPayload({
    title: "Test",
    description: "Test",
    condition: "NEW",
  });

  assert.equal(payload.availability.shipToLocationAvailability.quantity, 1);
});

test("buildOfferPayload produces correct structure", async () => {
  const { buildOfferPayload } = await import("./ebay-api.js");

  const payload = buildOfferPayload("vl-123", {
    description: "Great shoes",
    categoryId: "15709",
    price: "450.00",
    quantity: 1,
    merchantLocationKey: "warehouse-1",
  }, {
    fulfillmentPolicyId: "fp-1",
    paymentPolicyId: "pp-1",
    returnPolicyId: "rp-1",
  });

  assert.equal(payload.sku, "vl-123");
  assert.equal(payload.format, "FIXED_PRICE");
  assert.equal(payload.categoryId, "15709");
  assert.equal(payload.pricingSummary.price.value, "450.00");
  assert.equal(payload.pricingSummary.price.currency, "USD");
  assert.equal(payload.merchantLocationKey, "warehouse-1");
  assert.equal(payload.listingPolicies.fulfillmentPolicyId, "fp-1");
  assert.equal(payload.listingPolicies.paymentPolicyId, "pp-1");
  assert.equal(payload.listingPolicies.returnPolicyId, "rp-1");
  assert.equal(payload.availableQuantity, 1);
});

test("buildOfferPayload defaults merchantLocationKey to 'default'", async () => {
  const { buildOfferPayload } = await import("./ebay-api.js");

  const payload = buildOfferPayload("vl-456", {
    description: "Test",
    categoryId: "123",
    price: "10.00",
  }, {
    fulfillmentPolicyId: "fp",
    paymentPolicyId: "pp",
    returnPolicyId: "rp",
  });

  assert.equal(payload.merchantLocationKey, "default");
});
