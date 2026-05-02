/**
 * eBay API Client
 *
 * Wraps hendt/ebay-api for the VibeLyster eBay CLI.
 * Auth: EBAY_APP_ID, EBAY_CERT_ID, EBAY_REFRESH_TOKEN env vars.
 */

import eBayApi from "ebay-api";
import FormData from "form-data";
import { createReadStream } from "node:fs";
import { basename, extname } from "node:path";

const MARKETPLACE_ID = eBayApi.MarketplaceId.EBAY_US;
const SITE_ID = eBayApi.SiteId.EBAY_US;
const EBAY_US_CATEGORY_TREE_ID = "0";
const DEFAULT_CURRENCY = "USD";
const DEFAULT_SKU_PREFIX = "vl";

let client = null;

const DEFAULT_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
];

const CONDITION_MAP = {
  NEW: "NEW",
  NEW_OTHER: "NEW_OTHER",
  USED_EXCELLENT: "USED_EXCELLENT",
  USED_ACCEPTABLE: "USED_ACCEPTABLE",
};

export function resetClientForTest() {
  client = null;
}

export function getClient() {
  if (client) return client;

  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  const refreshToken = process.env.EBAY_REFRESH_TOKEN;

  if (!appId || !certId || !refreshToken) {
    const missing = [];
    if (!appId) missing.push("EBAY_APP_ID");
    if (!certId) missing.push("EBAY_CERT_ID");
    if (!refreshToken) missing.push("EBAY_REFRESH_TOKEN");
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}\n\n` +
        "Set these in your shell:\n" +
        "  export EBAY_APP_ID=your_client_id\n" +
        "  export EBAY_CERT_ID=your_client_secret\n" +
        "  export EBAY_REFRESH_TOKEN=your_refresh_token"
    );
  }

  const scopes = process.env.EBAY_SCOPE
    ? process.env.EBAY_SCOPE.split(/\s+/).filter(Boolean)
    : DEFAULT_SCOPES;

  client = new eBayApi({
    appId,
    certId,
    devId: process.env.EBAY_DEV_ID,
    sandbox: process.env.EBAY_SANDBOX === "true",
    autoRefreshToken: true,
    marketplaceId: MARKETPLACE_ID,
    siteId: SITE_ID,
    scope: scopes,
  });

  client.OAuth2.setCredentials({
    access_token: "",
    refresh_token: refreshToken,
    token_type: "User Access Token",
    expires_in: 0,
  });

  client.OAuth2.on("refreshAuthToken", () => {
    if (process.env.DEBUG?.includes("ebay")) {
      console.error("[ebay-cli] SDK refreshed OAuth user token");
    }
  });

  return client;
}

export async function checkAuth() {
  const user = await getClient().commerce.identity.getUser();
  return {
    username: user.username,
    userId: user.userId,
  };
}

export function resolveCondition(condition = "USED_EXCELLENT") {
  const key = String(condition).toUpperCase().replace(/-/g, "_");
  const resolved = CONDITION_MAP[key];
  if (!resolved) {
    throw new Error(
      `Unknown condition: ${condition}. Valid: ${Object.keys(CONDITION_MAP).join(", ")}`
    );
  }
  return resolved;
}

export async function searchCategories(query) {
  const result = await getClient().commerce.taxonomy.getCategorySuggestions(
    EBAY_US_CATEGORY_TREE_ID,
    query
  );
  return (result.categorySuggestions || []).map((suggestion) => ({
    categoryId: suggestion.category?.categoryId,
    categoryName: suggestion.category?.categoryName,
    categoryTreeNodeAncestors:
      suggestion.categoryTreeNodeAncestors?.map((ancestor) => ({
        categoryId: ancestor.categoryId,
        categoryName: ancestor.categoryName,
      })) || [],
  }));
}

export async function getAspects(categoryId) {
  const result = await getClient().commerce.taxonomy.getItemAspectsForCategory(
    EBAY_US_CATEGORY_TREE_ID,
    categoryId
  );
  return (result.aspects || []).map((aspect) => ({
    name: aspect.localizedAspectName,
    required: Boolean(aspect.aspectConstraint?.aspectRequired),
    recommended: Boolean(aspect.aspectConstraint?.aspectUsage === "RECOMMENDED"),
    values:
      aspect.aspectValues?.map((value) => value.localizedValue).filter(Boolean) ||
      [],
  }));
}

export async function getPolicies() {
  const eBay = getClient();
  const [fulfillment, payment, returns] = await Promise.all([
    eBay.sell.account.getFulfillmentPolicies(MARKETPLACE_ID),
    eBay.sell.account.getPaymentPolicies(MARKETPLACE_ID),
    eBay.sell.account.getReturnPolicies(MARKETPLACE_ID),
  ]);

  return {
    fulfillment: fulfillment.fulfillmentPolicies || [],
    payment: payment.paymentPolicies || [],
    return: returns.returnPolicies || [],
  };
}

export async function getLocations() {
  const result = await getClient().sell.inventory.getInventoryLocations({
    limit: 100,
  });
  return result.locations || result.merchantLocation || [];
}

export async function uploadImage(imagePath) {
  const extension = extname(imagePath).slice(1).toLowerCase();
  const pictureName = basename(imagePath);
  const mimeType = extension === "png" ? "image/png" : "image/jpeg";

  const result = await getClient().trading.UploadSiteHostedPictures(
    {
      PictureName: pictureName,
      PictureSet: "Supersize",
    },
    {
      useIaf: true,
      hook: (xml) => {
        const form = new FormData();
        form.append("XML Payload", xml, { contentType: "text/xml" });
        form.append(pictureName, createReadStream(imagePath), {
          filename: pictureName,
          contentType: mimeType,
        });
        return {
          body: form,
          headers: form.getHeaders(),
        };
      },
    }
  );

  const url = result.SiteHostedPictureDetails?.FullURL;
  if (!url) {
    throw new Error(`Image upload failed: ${JSON.stringify(result)}`);
  }
  return url;
}

export function buildInventoryItemPayload(listing) {
  return {
    availability: {
      shipToLocationAvailability: {
        quantity: Number(listing.quantity || 1),
      },
    },
    condition: resolveCondition(listing.condition),
    product: {
      title: listing.title,
      description: listing.description,
      imageUrls: listing.images || [],
      aspects: listing.aspects || {},
    },
  };
}

export function buildOfferPayload(sku, listing, policyIds) {
  return {
    sku,
    marketplaceId: MARKETPLACE_ID,
    format: "FIXED_PRICE",
    availableQuantity: Number(listing.quantity || 1),
    categoryId: listing.categoryId,
    listingDescription: listing.description,
    listingPolicies: {
      fulfillmentPolicyId: policyIds.fulfillmentPolicyId,
      paymentPolicyId: policyIds.paymentPolicyId,
      returnPolicyId: policyIds.returnPolicyId,
    },
    pricingSummary: {
      price: {
        currency: listing.currency || DEFAULT_CURRENCY,
        value: String(listing.price),
      },
    },
    merchantLocationKey: listing.merchantLocationKey || "default",
  };
}

function pickPolicyIds(policies, overrides = {}) {
  return {
    fulfillmentPolicyId:
      overrides.fulfillmentPolicyId ||
      policies.fulfillment?.[0]?.fulfillmentPolicyId,
    paymentPolicyId:
      overrides.paymentPolicyId || policies.payment?.[0]?.paymentPolicyId,
    returnPolicyId:
      overrides.returnPolicyId || policies.return?.[0]?.returnPolicyId,
  };
}

function requirePolicyIds(policyIds) {
  const missing = Object.entries(policyIds)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(
      `Missing eBay listing policies: ${missing.join(", ")}. Run ebay policies or pass policy override flags.`
    );
  }
}

export async function createListing(listing, options = {}) {
  const sku = options.sku || `${DEFAULT_SKU_PREFIX}-${Date.now()}`;
  const eBay = getClient();
  await eBay.sell.inventory.createOrReplaceInventoryItem(
    sku,
    buildInventoryItemPayload(listing)
  );

  const policies = await getPolicies();
  const policyIds = pickPolicyIds(policies, options);
  requirePolicyIds(policyIds);
  const offer = await eBay.sell.inventory.createOffer(
    buildOfferPayload(sku, listing, policyIds)
  );

  return {
    sku,
    offerId: offer.offerId,
    offer,
  };
}

export async function publishListing(offerId) {
  const result = await getClient().sell.inventory.publishOffer(offerId);
  return {
    listingId: result.listingId,
    url: result.listingId ? `https://www.ebay.com/itm/${result.listingId}` : null,
    raw: result,
  };
}

export async function listListings() {
  const result = await getClient().sell.inventory.getInventoryItems({
    limit: 100,
  });
  return result.inventoryItems || [];
}

export async function getListing(sku) {
  const eBay = getClient();
  const [inventoryItem, offers] = await Promise.all([
    eBay.sell.inventory.getInventoryItem(sku),
    eBay.sell.inventory.getOffers({ sku, marketplaceId: MARKETPLACE_ID }),
  ]);
  return {
    sku,
    inventoryItem,
    offers: offers.offers || [],
  };
}

export async function editListing(sku, listing, options = {}) {
  const eBay = getClient();
  await eBay.sell.inventory.createOrReplaceInventoryItem(
    sku,
    buildInventoryItemPayload(listing)
  );

  const offers = await eBay.sell.inventory.getOffers({
    sku,
    marketplaceId: MARKETPLACE_ID,
  });
  const offer = offers.offers?.[0];
  if (!offer?.offerId) {
    throw new Error(`No offer found for SKU ${sku}`);
  }

  const currentPolicyIds = {
    fulfillmentPolicyId: offer.listingPolicies?.fulfillmentPolicyId,
    paymentPolicyId: offer.listingPolicies?.paymentPolicyId,
    returnPolicyId: offer.listingPolicies?.returnPolicyId,
  };
  const policyIds = { ...currentPolicyIds, ...options };
  requirePolicyIds(policyIds);
  const updatedOffer = await eBay.sell.inventory.updateOffer(
    offer.offerId,
    buildOfferPayload(sku, listing, policyIds)
  );

  return {
    sku,
    offerId: offer.offerId,
    offer: updatedOffer,
  };
}

export async function deleteListing(sku) {
  const eBay = getClient();
  const offers = await eBay.sell.inventory.getOffers({
    sku,
    marketplaceId: MARKETPLACE_ID,
  });

  for (const offer of offers.offers || []) {
    if (offer.offerId) {
      if (offer.status === "PUBLISHED") {
        await eBay.sell.inventory.withdrawOffer(offer.offerId);
      }
      await eBay.sell.inventory.deleteOffer(offer.offerId);
    }
  }

  await eBay.sell.inventory.deleteInventoryItem(sku);
  return { sku, deleted: true };
}
