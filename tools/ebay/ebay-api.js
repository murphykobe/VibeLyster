/**
 * eBay API Client
 *
 * Wraps hendt/ebay-api for the VibeLyster eBay CLI.
 * Auth: `ebay login` saved credentials, or EBAY_REFRESH_TOKEN for headless use.
 */

import eBayApi from "ebay-api";
import FormData from "form-data";
import { createReadStream } from "node:fs";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const MARKETPLACE_ID = eBayApi.MarketplaceId.EBAY_US;
const SITE_ID = eBayApi.SiteId.EBAY_US;
const EBAY_US_CATEGORY_TREE_ID = "0";
const DEFAULT_CURRENCY = "USD";
const DEFAULT_SKU_PREFIX = "vl";

let client = null;

const DEFAULT_SCOPES = [
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.account.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.inventory.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
];

const CONDITION_MAP = {
  NEW: "NEW",
  NEW_OTHER: "NEW_OTHER",
  NEW_WITH_DEFECTS: "NEW_WITH_DEFECTS",
  USED_EXCELLENT: "USED_EXCELLENT",
  USED_VERY_GOOD: "USED_VERY_GOOD",
  USED_GOOD: "USED_GOOD",
  USED_ACCEPTABLE: "USED_ACCEPTABLE",
};

export function getRuName() {
  return process.env.EBAY_RU_NAME;
}

export function resetClientForTest() {
  client = null;
}

export function getConfigFile() {
  return process.env.EBAY_CONFIG_FILE || join(homedir(), ".vibelyster", "ebay.json");
}

export function loadAuthToken() {
  const configFile = getConfigFile();
  if (!existsSync(configFile)) return null;
  const data = JSON.parse(readFileSync(configFile, "utf-8"));
  return data.token || data;
}

export function saveAuthToken(token) {
  const configFile = getConfigFile();
  mkdirSync(dirname(configFile), { recursive: true });
  writeFileSync(
    configFile,
    JSON.stringify({ token, savedAt: new Date().toISOString() }, null, 2)
  );
}

export function clearAuthToken() {
  try {
    unlinkSync(getConfigFile());
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function getBaseConfig() {
  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;

  if (!appId || !certId) {
    const missing = [];
    if (!appId) missing.push("EBAY_APP_ID");
    if (!certId) missing.push("EBAY_CERT_ID");
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}\n\n` +
        "Set these in your shell:\n" +
        "  export EBAY_APP_ID=your_client_id\n" +
        "  export EBAY_CERT_ID=your_client_secret"
    );
  }

  const scopes = process.env.EBAY_SCOPE
    ? process.env.EBAY_SCOPE.split(/\s+/).filter(Boolean)
    : DEFAULT_SCOPES;

  return {
    appId,
    certId,
    devId: process.env.EBAY_DEV_ID,
    ruName: getRuName(),
    sandbox: process.env.EBAY_SANDBOX === "true",
    autoRefreshToken: true,
    marketplaceId: MARKETPLACE_ID,
    siteId: SITE_ID,
    scope: scopes,
  };
}

function buildClient() {
  return new eBayApi(getBaseConfig());
}

function tokenFromEnv() {
  if (!process.env.EBAY_REFRESH_TOKEN) return null;
  return {
    access_token: process.env.EBAY_ACCESS_TOKEN || "",
    refresh_token: process.env.EBAY_REFRESH_TOKEN,
    token_type: "User Access Token",
    expires_in: 0,
  };
}

export function getClient() {
  if (client) return client;

  getBaseConfig();
  const token = tokenFromEnv() || loadAuthToken();
  if (!token?.refresh_token && !token?.access_token) {
    throw new Error(
      "Not logged in to eBay.\n\n" +
        "Run `ebay login` to authorize this seller account,\n" +
        "or set EBAY_REFRESH_TOKEN for headless/CI usage."
    );
  }

  client = buildClient();

  client.OAuth2.setCredentials(token);

  client.OAuth2.on("refreshAuthToken", (refreshedToken) => {
    if (!process.env.EBAY_REFRESH_TOKEN) saveAuthToken(refreshedToken);
    if (process.env.DEBUG?.includes("ebay")) {
      console.error("[ebay-cli] SDK refreshed OAuth user token");
    }
  });

  return client;
}

export function generateLoginUrl() {
  const eBay = buildClient();
  const ruName = requireCliRuName();
  return eBay.OAuth2.generateAuthUrl(ruName, undefined, `cli-${Date.now()}`);
}

function requireCliRuName() {
  const ruName = getRuName();
  if (!ruName) {
    throw new Error(
      "EBAY_RU_NAME is required for ebay login. The callback route must preserve the code when OAuth state starts with cli."
    );
  }
  return ruName;
}

export function parseAuthorizationCode(input) {
  if (!input) throw new Error("Authorization code or callback URL is required");
  try {
    const url = new URL(input);
    const code = url.searchParams.get("code");
    if (code) return code;
  } catch {
    // Input is likely already the raw code.
  }
  return input.trim();
}

export async function exchangeAuthorizationCode(input) {
  const eBay = buildClient();
  const token = await eBay.OAuth2.getToken(parseAuthorizationCode(input), requireCliRuName());
  saveAuthToken(token);
  resetClientForTest();
  return token;
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

export function mapActiveListings(response) {
  const items = response?.ActiveList?.ItemArray?.Item;
  const list = Array.isArray(items) ? items : items ? [items] : [];
  return list.map((item) => ({
    itemId: String(item.ItemID),
    title: item.Title || "(untitled)",
    price: String(item.SellingStatus?.CurrentPrice?.value ?? item.BuyItNowPrice?.value ?? ""),
    currency:
      item.SellingStatus?.CurrentPrice?.currencyID ||
      item.BuyItNowPrice?.currencyID ||
      DEFAULT_CURRENCY,
    quantityAvailable: Number(item.QuantityAvailable ?? item.Quantity ?? 0),
    watchCount: Number(item.WatchCount ?? 0),
    url: item.ListingDetails?.ViewItemURL || null,
  }));
}

export async function listActiveListings({ limit = 25, page = 1 } = {}) {
  const response = await getClient().trading.GetMyeBaySelling(
    {
      ActiveList: {
        Include: true,
        Pagination: {
          EntriesPerPage: Number(limit),
          PageNumber: Number(page),
        },
      },
      DetailLevel: "ReturnAll",
      Version: 967,
    },
    { useIaf: true }
  );

  return {
    listings: mapActiveListings(response),
    totalEntries: Number(response?.ActiveList?.PaginationResult?.TotalNumberOfEntries ?? 0),
    totalPages: Number(response?.ActiveList?.PaginationResult?.TotalNumberOfPages ?? 0),
    raw: response,
  };
}

/**
 * Uploads a local image file to eBay Picture Services via the Commerce Media
 * API and returns the resulting hosted image URL.
 *
 * Replaces the Trading API's UploadSiteHostedPictures, which eBay
 * decommissions 2026-09-30. createImageFromFile has no wrapper method in
 * the ebay-api library (its Media class only covers video), so this calls
 * the library's underlying REST client directly. It responds 201 with no
 * body; the new image's id comes back in the Location header, and a
 * follow-up getImage call resolves that id to the actual EPS URL.
 */
export async function uploadImage(imagePath) {
  const extension = extname(imagePath).slice(1).toLowerCase();
  const mimeType =
    extension === "png" ? "image/png" : extension === "gif" ? "image/gif" : "image/jpeg";

  const form = new FormData();
  form.append("image", createReadStream(imagePath), {
    filename: basename(imagePath),
    contentType: mimeType,
  });

  const media = getClient().commerce.media;
  const created = await media.api({ returnResponse: true }).post("/image/create_from_file", form, {
    headers: form.getHeaders(),
  });

  const location = created?.headers?.location;
  const imageId = location?.split("/").filter(Boolean).pop();
  if (!imageId) {
    throw new Error(`Image upload failed: no image id in Location header (got "${location}")`);
  }

  const { imageUrl } = await media.get(`/image/${encodeURIComponent(imageId)}`);
  if (!imageUrl) {
    throw new Error(`Image upload failed: getImage returned no imageUrl for id ${imageId}`);
  }
  return imageUrl;
}

/** True for a local file path; false for an already-hosted http(s) URL. */
export function isLocalImagePath(value) {
  return !/^https?:\/\//i.test(value);
}

/**
 * Uploads any local image paths in listing.images and returns a copy of
 * listing with images replaced by their eBay-hosted URLs. Already-hosted
 * URLs pass through untouched, so a listing built entirely from `upload`
 * output (or a prior create/edit) costs no extra network calls.
 */
export async function resolveListingImages(listing) {
  const images = listing.images || [];
  const resolved = await Promise.all(
    images.map((image) => (isLocalImagePath(image) ? uploadImage(image) : image))
  );
  return { ...listing, images: resolved };
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
  listing = await resolveListingImages(listing);
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
  listing = await resolveListingImages(listing);
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
