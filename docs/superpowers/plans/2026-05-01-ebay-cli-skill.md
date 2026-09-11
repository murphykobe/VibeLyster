# eBay CLI + Agent Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@vibelyster/ebay-cli` npm package wrapping hendt/ebay-api + `ebay-listing/SKILL.md` agent skill in GrailedAgent repo.

**Architecture:** Single-file ESM CLI (`cli.js`) routing commands to an API module (`ebay-api.js`) that wraps the `ebay-api` npm package. Auth via three env vars. Flattened create/publish flow hides eBay's 3-step inventory item → offer → publish ceremony. SKILL.md mirrors existing Grailed/Depop skill structure.

**Tech Stack:** Node.js 18+, `ebay-api` (hendt), `form-data`, esbuild

**Design Spec:** `docs/superpowers/specs/2026-05-01-ebay-cli-skill-design.md`

**Reference implementations:**
- `tools/grailed/cli.js` + `tools/grailed/grailed-api.js` — CLI pattern to follow
- `tools/depop/cli.js` + `tools/depop/depop-api.js` — Auth pattern to follow (env vars, no file storage)

**Delivery order:**
1. Build, verify, commit, and PR the CLI in `/Users/murphy/workplace/VibeLyster` first.
2. After the CLI PR is ready, build, verify, commit, and PR the `ebay-listing` skill in `/Users/murphy/workplace/GrailedAgent`.

These are two separate repos, two separate branches, two separate commits/PRs. Check `git status` before creating each branch and before each commit so unrelated user work is not included.

---

### Task 1: Create branch and scaffold package

**Files:**
- Create: `tools/ebay/package.json`

- [ ] **Step 1: Check VibeLyster worktree before branching**

```bash
cd /Users/murphy/workplace/VibeLyster
git status --short
```

Expected: only unrelated user changes or the untracked docs from this plan. Do not include unrelated files in later commits.

- [ ] **Step 2: Create feature branch**

```bash
cd /Users/murphy/workplace/VibeLyster
git checkout -b feat/ebay-cli
```

- [ ] **Step 3: Create directory structure**

```bash
mkdir -p tools/ebay/examples tools/ebay/dist
```

- [ ] **Step 4: Write package.json**

Create `tools/ebay/package.json`:

```json
{
  "name": "@vibelyster/ebay-cli",
  "version": "0.1.0",
  "description": "CLI for eBay Sell API — list, create, edit, and manage eBay listings",
  "type": "module",
  "bin": {
    "ebay": "./dist/cli.js"
  },
  "files": [
    "dist/"
  ],
  "scripts": {
    "build": "esbuild cli.js --bundle --platform=node --format=esm --minify --external:ebay-api --external:form-data --outfile=dist/cli.js",
    "prepublishOnly": "npm run build"
  },
  "engines": {
    "node": ">=18"
  },
  "dependencies": {
    "ebay-api": "^9.5.1",
    "form-data": "^4.0.0"
  },
  "devDependencies": {
    "esbuild": "^0.25.0"
  },
  "keywords": [
    "ebay",
    "reselling",
    "cli",
    "listing",
    "inventory"
  ],
  "license": "MIT",
  "private": false
}
```

- [ ] **Step 5: Install dependencies**

```bash
cd /Users/murphy/workplace/VibeLyster/tools/ebay
npm install
```

- [ ] **Step 6: Check VibeLyster worktree before committing**

```bash
cd /Users/murphy/workplace/VibeLyster
git status --short
```

Expected: staged/unstaged changes only under `tools/ebay/` for this task.

- [ ] **Step 7: Commit scaffold**

```bash
cd /Users/murphy/workplace/VibeLyster
git add tools/ebay/package.json tools/ebay/package-lock.json
git commit -m "feat(ebay-cli): scaffold @vibelyster/ebay-cli package"
```

---

### Task 2: ebay-api.js — Client initialization and auth

**Files:**
- Create: `tools/ebay/ebay-api.js`

This task creates the API module with the eBay client factory and auth verification. All subsequent API functions are added to this file in later tasks.

- [ ] **Step 1: Create ebay-api.js with client initialization and auth check**

Create `tools/ebay/ebay-api.js`:

```js
/**
 * eBay API Client
 *
 * Wraps the hendt/ebay-api library for the VibeLyster CLI.
 * Auth: EBAY_APP_ID, EBAY_CERT_ID, EBAY_REFRESH_TOKEN env vars.
 * Auto-refreshes access tokens via the library's built-in OAuth2.
 *
 * API surface: Sell Inventory, Sell Account, Commerce Taxonomy, Trading (image upload)
 */

import eBayApi from "ebay-api";
import FormData from "form-data";

let _client = null;

/**
 * Get or create the singleton eBay API client.
 * Reads credentials from env vars on first call.
 */
export function getClient() {
  if (_client) return _client;

  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  const refreshToken = process.env.EBAY_REFRESH_TOKEN;
  const devId = process.env.EBAY_DEV_ID || "";

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

  _client = new eBayApi({
    appId,
    certId,
    devId,
    sandbox: process.env.EBAY_SANDBOX === "true",
    autoRefreshToken: true,
    marketplaceId: eBayApi.MarketplaceId.EBAY_US,
  });

  _client.OAuth2.setCredentials({
    access_token: "",
    refresh_token: refreshToken,
    token_type: "User Access Token",
    expires_in: 0,
  });

  _client.OAuth2.on("refreshAuthToken", () => {
    if (process.env.DEBUG?.includes("ebay")) {
      console.error("[ebay-cli] SDK refreshed OAuth user token");
    }
  });

  return _client;
}

// Auth

/**
 * Verify credentials by calling the eBay Identity API.
 * Returns { username, userId } on success.
 */
export async function checkAuth() {
  const eBay = getClient();
  const user = await eBay.commerce.identity.getUser();
  return {
    username: user.username,
    userId: user.userId,
  };
}
```

- [ ] **Step 2: Verify the module parses correctly**

```bash
cd /Users/murphy/workplace/VibeLyster/tools/ebay
node -e "import('./ebay-api.js').then(() => console.log('OK'))"
```

Expected: `OK` (module loads without syntax errors)

- [ ] **Step 3: Verify SDK auth wiring early**

Run this before building more commands so SDK method names, refresh-token credentials, and sandbox/production routing are proven early:

```bash
cd /Users/murphy/workplace/VibeLyster/tools/ebay
DEBUG=ebay:* node -e "import('./ebay-api.js').then(async ({ checkAuth }) => console.log(await checkAuth()))"
```

Expected with valid `EBAY_APP_ID`, `EBAY_CERT_ID`, and `EBAY_REFRESH_TOKEN`: prints an object with `username` and `userId`. If credentials are unavailable in this session, record that this live check is deferred and run it before Task 11. If it fails with a method-name or token-refresh issue, fix `getClient()` / `checkAuth()` before continuing.

- [ ] **Step 4: Commit**

```bash
cd /Users/murphy/workplace/VibeLyster
git add tools/ebay/ebay-api.js
git commit -m "feat(ebay-cli): add ebay-api.js with client init and auth check"
```

---

### Task 3: ebay-api.js — Reference data functions

**Files:**
- Modify: `tools/ebay/ebay-api.js` (append after auth section)

- [ ] **Step 1: Add category search, aspects, policies, and locations functions**

Append to `tools/ebay/ebay-api.js` after the auth section:

```js
// Taxonomy

const EBAY_US_CATEGORY_TREE_ID = "0";

/**
 * Search eBay categories by keyword.
 * Returns top suggestions with category IDs and names.
 */
export async function getCategorySuggestions(query) {
  const eBay = getClient();
  const result = await eBay.commerce.taxonomy.getCategorySuggestions(
    EBAY_US_CATEGORY_TREE_ID,
    { q: query }
  );
  return (result.categorySuggestions || []).map((s) => ({
    categoryId: s.category.categoryId,
    categoryName: s.category.categoryName,
    categoryTreeNodeLevel: s.categoryTreeNodeLevel,
  }));
}

/**
 * Get required and recommended item aspects for a category.
 * Returns aspects with their constraints and allowed values.
 */
export async function getItemAspects(categoryId) {
  const eBay = getClient();
  const result = await eBay.commerce.taxonomy.getItemAspectsForCategory(
    EBAY_US_CATEGORY_TREE_ID,
    { category_id: categoryId }
  );
  return (result.aspects || []).map((a) => ({
    name: a.localizedAspectName,
    required: a.aspectConstraint?.aspectRequired || false,
    mode: a.aspectConstraint?.aspectMode,
    values: (a.aspectValues || []).map((v) => v.localizedValue).slice(0, 20),
  }));
}

// ─── Seller Account ──────────────────────────────────────────────────────────

/**
 * List fulfillment policies (shipping).
 */
export async function getFulfillmentPolicies() {
  const eBay = getClient();
  const result = await eBay.sell.account.getFulfillmentPolicies({
    marketplace_id: "EBAY_US",
  });
  return (result.fulfillmentPolicies || []).map((p) => ({
    id: p.fulfillmentPolicyId,
    name: p.name,
    description: p.description,
  }));
}

/**
 * List payment policies.
 */
export async function getPaymentPolicies() {
  const eBay = getClient();
  const result = await eBay.sell.account.getPaymentPolicies({
    marketplace_id: "EBAY_US",
  });
  return (result.paymentPolicies || []).map((p) => ({
    id: p.paymentPolicyId,
    name: p.name,
    description: p.description,
  }));
}

/**
 * List return policies.
 */
export async function getReturnPolicies() {
  const eBay = getClient();
  const result = await eBay.sell.account.getReturnPolicies({
    marketplace_id: "EBAY_US",
  });
  return (result.returnPolicies || []).map((p) => ({
    id: p.returnPolicyId,
    name: p.name,
    description: p.description,
  }));
}

/**
 * List merchant locations.
 */
export async function getLocations() {
  const eBay = getClient();
  const result = await eBay.sell.inventory.getInventoryLocations();
  return (result.locations || []).map((l) => ({
    key: l.merchantLocationKey,
    name: l.name,
    city: l.location?.address?.city,
    state: l.location?.address?.stateOrProvince,
  }));
}
```

- [ ] **Step 2: Verify module still parses**

```bash
cd /Users/murphy/workplace/VibeLyster/tools/ebay
node -e "import('./ebay-api.js').then(() => console.log('OK'))"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd /Users/murphy/workplace/VibeLyster
git add tools/ebay/ebay-api.js
git commit -m "feat(ebay-cli): add taxonomy, policies, and locations API functions"
```

---

### Task 4: ebay-api.js — Image upload

**Files:**
- Modify: `tools/ebay/ebay-api.js` (append after seller account section)

- [ ] **Step 1: Add image upload function using Trading API**

Append to `tools/ebay/ebay-api.js`:

```js
// Image Upload

/**
 * Upload an image to eBay via Trading API UploadSiteHostedPictures.
 * Returns the eBay-hosted image URL.
 */
export async function uploadImage(imagePath) {
  const { readFileSync } = await import("node:fs");
  const { extname } = await import("node:path");

  const eBay = getClient();
  const imageBuffer = readFileSync(imagePath);
  const ext = extname(imagePath).slice(1).toLowerCase() || "jpg";
  const mimeType = ext === "png" ? "image/png" : "image/jpeg";

  const response = await eBay.trading.UploadSiteHostedPictures(
    { PictureName: `vl-${Date.now()}.${ext}` },
    {
      hook: (xml) => {
        const form = new FormData();
        form.append("XML Payload", xml, {
          contentType: "text/xml",
          filename: "payload.xml",
        });
        form.append("image", imageBuffer, {
          contentType: mimeType,
          filename: `image.${ext}`,
        });
        return {
          body: form,
          headers: form.getHeaders(),
        };
      },
    }
  );

  const url =
    response?.SiteHostedPictureDetails?.FullURL ||
    response?.SiteHostedPictureDetails?.BaseURL;
  if (!url) {
    throw new Error(
      "Image upload returned no URL: " + JSON.stringify(response)
    );
  }
  return url;
}
```

- [ ] **Step 2: Verify module still parses**

```bash
cd /Users/murphy/workplace/VibeLyster/tools/ebay
node -e "import('./ebay-api.js').then(() => console.log('OK'))"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd /Users/murphy/workplace/VibeLyster
git add tools/ebay/ebay-api.js
git commit -m "feat(ebay-cli): add image upload via Trading API"
```

---

### Task 5: ebay-api.js — Listing lifecycle (create, publish, edit, delete, list)

**Files:**
- Modify: `tools/ebay/ebay-api.js` (append after image upload section)

- [ ] **Step 1: Add condition mapping and listing lifecycle functions**

Append to `tools/ebay/ebay-api.js`:

```js
// ─── Condition Mapping ───────────────────────────────────────────────────────

const CONDITION_MAP = {
  NEW: { id: 1000, description: "New" },
  NEW_OTHER: { id: 1500, description: "New other" },
  NEW_WITH_DEFECTS: { id: 1750, description: "New with defects" },
  USED_EXCELLENT: { id: 3000, description: "Used - Excellent" },
  USED_VERY_GOOD: { id: 4000, description: "Used - Very Good" },
  USED_GOOD: { id: 5000, description: "Used - Good" },
  USED_ACCEPTABLE: { id: 7000, description: "Used - Acceptable" },
};

function resolveCondition(condition) {
  const upper = (condition || "USED_EXCELLENT").toUpperCase().replace(/-/g, "_");
  const mapped = CONDITION_MAP[upper];
  if (!mapped) {
    throw new Error(
      `Unknown condition: ${condition}. Valid: ${Object.keys(CONDITION_MAP).join(", ")}`
    );
  }
  return mapped;
}

// Inventory & Offers

/**
 * Create an inventory item + offer in one call.
 * Returns { sku, offerId }.
 */
export async function createListing(data) {
  const eBay = getClient();
  const sku = `vl-${Date.now()}`;
  const condition = resolveCondition(data.condition);

  // Step 1: Create inventory item
  await eBay.sell.inventory.createOrReplaceInventoryItem(sku, {
    product: {
      title: data.title,
      description: data.description,
      aspects: data.aspects || {},
      imageUrls: data.images || [],
    },
    condition: data.condition?.toUpperCase().replace(/-/g, "_") || "USED_EXCELLENT",
    conditionDescription: data.conditionDescription || "",
    availability: {
      shipToLocationAvailability: {
        quantity: data.quantity || 1,
      },
    },
  });

  // Step 2: Auto-fetch policies if not provided
  let fulfillmentPolicyId = data.fulfillmentPolicyId;
  let paymentPolicyId = data.paymentPolicyId;
  let returnPolicyId = data.returnPolicyId;

  if (!fulfillmentPolicyId || !paymentPolicyId || !returnPolicyId) {
    const [fulfillment, payment, returns] = await Promise.all([
      !fulfillmentPolicyId ? getFulfillmentPolicies() : Promise.resolve(null),
      !paymentPolicyId ? getPaymentPolicies() : Promise.resolve(null),
      !returnPolicyId ? getReturnPolicies() : Promise.resolve(null),
    ]);
    if (!fulfillmentPolicyId) {
      if (!fulfillment?.length)
        throw new Error("No fulfillment policies found. Create one at ebay.com/sell first.");
      fulfillmentPolicyId = fulfillment[0].id;
    }
    if (!paymentPolicyId) {
      if (!payment?.length)
        throw new Error("No payment policies found. Create one at ebay.com/sell first.");
      paymentPolicyId = payment[0].id;
    }
    if (!returnPolicyId) {
      if (!returns?.length)
        throw new Error("No return policies found. Create one at ebay.com/sell first.");
      returnPolicyId = returns[0].id;
    }
  }

  // Step 3: Create offer
  const offerResponse = await eBay.sell.inventory.createOffer({
    sku,
    marketplaceId: "EBAY_US",
    format: "FIXED_PRICE",
    availableQuantity: data.quantity || 1,
    categoryId: data.categoryId,
    listingDescription: data.description,
    merchantLocationKey: data.merchantLocationKey || "default",
    pricingSummary: {
      price: {
        currency: "USD",
        value: String(data.price),
      },
    },
    listingPolicies: {
      fulfillmentPolicyId,
      paymentPolicyId,
      returnPolicyId,
    },
  });

  return { sku, offerId: offerResponse.offerId };
}

/**
 * Publish an offer — makes it a live listing.
 * Returns { listingId }.
 */
export async function publishOffer(offerId) {
  const eBay = getClient();
  const result = await eBay.sell.inventory.publishOffer(offerId);
  return { listingId: result.listingId };
}

/**
 * Get all inventory items (paginated).
 */
export async function getInventoryItems(limit = 25, offset = 0) {
  const eBay = getClient();
  const result = await eBay.sell.inventory.getInventoryItems({ limit, offset });
  return {
    items: (result.inventoryItems || []).map((item) => ({
      sku: item.sku,
      title: item.product?.title || "(no title)",
      condition: item.condition,
      quantity: item.availability?.shipToLocationAvailability?.quantity,
    })),
    total: result.total || 0,
  };
}

/**
 * Get a single inventory item by SKU.
 */
export async function getInventoryItem(sku) {
  const eBay = getClient();
  const item = await eBay.sell.inventory.getInventoryItem(sku);
  return item;
}

/**
 * Get offers for a SKU.
 */
export async function getOffers(sku) {
  const eBay = getClient();
  const result = await eBay.sell.inventory.getOffers({ sku });
  return (result.offers || []).map((o) => ({
    offerId: o.offerId,
    status: o.status,
    listingId: o.listing?.listingId,
    price: o.pricingSummary?.price?.value,
    categoryId: o.categoryId,
    marketplaceId: o.marketplaceId,
  }));
}

/**
 * Update an inventory item and its offer.
 */
export async function updateListing(sku, data) {
  const eBay = getClient();

  // Update inventory item
  await eBay.sell.inventory.createOrReplaceInventoryItem(sku, {
    product: {
      title: data.title,
      description: data.description,
      aspects: data.aspects || {},
      imageUrls: data.images || [],
    },
    condition: data.condition?.toUpperCase().replace(/-/g, "_") || "USED_EXCELLENT",
    conditionDescription: data.conditionDescription || "",
    availability: {
      shipToLocationAvailability: {
        quantity: data.quantity || 1,
      },
    },
  });

  // Find and update the associated offer
  const offers = await getOffers(sku);
  if (offers.length > 0) {
    const offer = offers[0];
    const updatePayload = {};
    if (data.price) {
      updatePayload.pricingSummary = {
        price: { currency: "USD", value: String(data.price) },
      };
    }
    if (data.categoryId) {
      updatePayload.categoryId = data.categoryId;
    }
    if (Object.keys(updatePayload).length > 0) {
      await eBay.sell.inventory.updateOffer(offer.offerId, updatePayload);
    }
    return { sku, offerId: offer.offerId };
  }

  return { sku, offerId: null };
}

/**
 * Withdraw offer (if published) and delete inventory item.
 */
export async function deleteListing(sku) {
  const eBay = getClient();

  // Try to withdraw any published offers first
  try {
    const offers = await getOffers(sku);
    for (const offer of offers) {
      if (offer.status === "PUBLISHED") {
        await eBay.sell.inventory.withdrawOffer(offer.offerId);
      }
    }
  } catch {
    // Offer may not exist or already withdrawn
  }

  // Delete the inventory item
  await eBay.sell.inventory.deleteInventoryItem(sku);
}
```

- [ ] **Step 2: Verify module still parses**

```bash
cd /Users/murphy/workplace/VibeLyster/tools/ebay
node -e "import('./ebay-api.js').then(() => console.log('OK'))"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd /Users/murphy/workplace/VibeLyster
git add tools/ebay/ebay-api.js
git commit -m "feat(ebay-cli): add listing lifecycle functions (create, publish, edit, delete)"
```

---

### Task 6: cli.js — Help and auth command

**Files:**
- Create: `tools/ebay/cli.js`

- [ ] **Step 1: Create cli.js with help text and auth command**

Create `tools/ebay/cli.js`:

```js
#!/usr/bin/env node

/**
 * eBay CLI — VibeLyster
 *
 * Usage:
 *   ebay auth                             Verify credentials
 *   ebay categories <query>               Search categories by keyword
 *   ebay aspects <categoryId>             List required/recommended item specifics
 *   ebay policies                         List fulfillment/payment/return policies
 *   ebay locations                        List merchant locations
 *   ebay upload <image-path>              Upload image, returns eBay-hosted URL
 *   ebay create <json-file>               Create inventory item + offer (draft)
 *   ebay publish <offerId>                Publish offer → live listing
 *   ebay listings                         List active inventory items
 *   ebay listing <sku>                    View listing details
 *   ebay edit <sku> <json-file>           Update listing in-place
 *   ebay delete <sku>                     Withdraw offer + delete item
 *
 * Auth: Set EBAY_APP_ID, EBAY_CERT_ID, and EBAY_REFRESH_TOKEN env vars.
 *       Optionally set EBAY_DEV_ID for Trading API (image upload).
 *       Set EBAY_SANDBOX=true for sandbox mode.
 */

import * as api from "./ebay-api.js";
import { readFile } from "node:fs/promises";

function getFlagValue(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

function cleanArgs(args) {
  const cleaned = [];
  const valueFlags = ["--fulfillment-policy", "--payment-policy", "--return-policy"];
  let i = 0;
  while (i < args.length) {
    if (valueFlags.includes(args[i])) {
      i += 2;
    } else {
      cleaned.push(args[i]);
      i++;
    }
  }
  return cleaned;
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const args = cleanArgs(rawArgs);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    console.log(`eBay CLI — VibeLyster

Commands:
  auth                             Verify credentials
  categories <query>               Search categories by keyword
  aspects <categoryId>             List required/recommended item specifics
  policies                         List fulfillment/payment/return policies
  locations                        List merchant locations
  upload <image-path>              Upload image, returns eBay-hosted URL
  create <json-file>               Create inventory item + offer (draft)
  publish <offerId>                Publish offer → live listing
  listings                         List active inventory items
  listing <sku>                    View listing details
  edit <sku> <json-file>           Update listing in-place
  delete <sku>                     Withdraw offer + delete item

Auth:
  Set EBAY_APP_ID, EBAY_CERT_ID, and EBAY_REFRESH_TOKEN env vars.
  Optionally set EBAY_DEV_ID for Trading API (image upload).
  Set EBAY_SANDBOX=true for sandbox mode.
`);
    return;
  }

  try {
    switch (command) {
      case "auth": {
        const user = await api.checkAuth();
        console.log("Logged in as:", user.username);
        console.log("User ID:", user.userId);
        console.log("Sandbox:", process.env.EBAY_SANDBOX === "true" ? "yes" : "no");
        break;
      }

      // Additional commands added in subsequent tasks

      default:
        console.error(`Unknown command: ${command}`);
        console.error('Run "ebay --help" for usage.');
        process.exit(1);
    }
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
}

main();
```

- [ ] **Step 2: Verify syntax**

```bash
cd /Users/murphy/workplace/VibeLyster/tools/ebay
node -e "import('./cli.js').catch(() => {})" 2>&1 | head -5
```

Expected: Error about missing env vars (not a syntax error) — this confirms the module loads.

- [ ] **Step 3: Commit**

```bash
cd /Users/murphy/workplace/VibeLyster
git add tools/ebay/cli.js
git commit -m "feat(ebay-cli): add cli.js with help and auth command"
```

---

### Task 7: cli.js — Reference commands (categories, aspects, policies, locations)

**Files:**
- Modify: `tools/ebay/cli.js` (add cases before `default:`)

- [ ] **Step 1: Add categories, aspects, policies, and locations commands**

In `tools/ebay/cli.js`, replace the line `// Additional commands added in subsequent tasks` and the `default:` case with:

```js
      case "categories": {
        const query = args[1];
        if (!query) {
          console.error("Usage: ebay categories <query>");
          console.error('\nExample: ebay categories "sneakers"');
          process.exit(1);
        }
        const suggestions = await api.getCategorySuggestions(query);
        if (!suggestions.length) {
          console.log("No categories found for:", query);
          break;
        }
        for (const s of suggestions) {
          console.log(`[${s.categoryId}] ${s.categoryName}`);
        }
        break;
      }

      case "aspects": {
        const categoryId = args[1];
        if (!categoryId) {
          console.error("Usage: ebay aspects <categoryId>");
          console.error("\nGet category IDs from: ebay categories <query>");
          process.exit(1);
        }
        const aspects = await api.getItemAspects(categoryId);
        if (!aspects.length) {
          console.log("No aspects found for category:", categoryId);
          break;
        }
        console.log("Required:");
        for (const a of aspects.filter((a) => a.required)) {
          const vals = a.values.length ? ` (${a.values.join(", ")})` : "";
          console.log(`  ${a.name}${vals}`);
        }
        const recommended = aspects.filter((a) => !a.required);
        if (recommended.length) {
          console.log("\nRecommended:");
          for (const a of recommended) {
            const vals = a.values.length ? ` (${a.values.join(", ")})` : "";
            console.log(`  ${a.name}${vals}`);
          }
        }
        break;
      }

      case "policies": {
        const [fulfillment, payment, returns] = await Promise.all([
          api.getFulfillmentPolicies(),
          api.getPaymentPolicies(),
          api.getReturnPolicies(),
        ]);
        console.log("Fulfillment (shipping) policies:");
        for (const p of fulfillment) {
          console.log(`  [${p.id}] ${p.name}`);
        }
        console.log("\nPayment policies:");
        for (const p of payment) {
          console.log(`  [${p.id}] ${p.name}`);
        }
        console.log("\nReturn policies:");
        for (const p of returns) {
          console.log(`  [${p.id}] ${p.name}`);
        }
        break;
      }

      case "locations": {
        const locations = await api.getLocations();
        if (!locations.length) {
          console.log("No merchant locations found.");
          console.log("Create one at: ebay.com → Account Settings → Shipping Addresses");
          break;
        }
        for (const l of locations) {
          const loc = [l.city, l.state].filter(Boolean).join(", ");
          console.log(`[${l.key}] ${l.name || "(unnamed)"}${loc ? ` — ${loc}` : ""}`);
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        console.error('Run "ebay --help" for usage.');
        process.exit(1);
```

- [ ] **Step 2: Commit**

```bash
cd /Users/murphy/workplace/VibeLyster
git add tools/ebay/cli.js
git commit -m "feat(ebay-cli): add categories, aspects, policies, locations commands"
```

---

### Task 8: cli.js — Upload, create, publish commands

**Files:**
- Modify: `tools/ebay/cli.js` (add cases before `default:`)

- [ ] **Step 1: Add upload, create, and publish commands**

In `tools/ebay/cli.js`, add these cases before the `case "locations":` block (or wherever they fit in order — they should go before `default:`):

```js
      case "upload": {
        const imagePath = args[1];
        if (!imagePath) {
          console.error("Usage: ebay upload <image-path>");
          console.error("\nUploads an image to eBay. Returns a hosted URL for use in listings.");
          process.exit(1);
        }
        console.log("Uploading...");
        const imageUrl = await api.uploadImage(imagePath);
        console.log("Uploaded:", imageUrl);
        break;
      }

      case "create": {
        const jsonFile = args[1];
        if (!jsonFile) {
          console.error("Usage: ebay create <json-file>");
          console.error("\nCreates an inventory item + offer (unpublished draft).");
          console.error("See examples/draft.json for the payload format.");
          process.exit(1);
        }
        const data = JSON.parse(await readFile(jsonFile, "utf-8"));

        // Apply policy overrides from flags
        const fulfillmentPolicy = getFlagValue(rawArgs, "--fulfillment-policy");
        const paymentPolicy = getFlagValue(rawArgs, "--payment-policy");
        const returnPolicy = getFlagValue(rawArgs, "--return-policy");
        if (fulfillmentPolicy) data.fulfillmentPolicyId = fulfillmentPolicy;
        if (paymentPolicy) data.paymentPolicyId = paymentPolicy;
        if (returnPolicy) data.returnPolicyId = returnPolicy;

        console.log("Creating listing...");
        const result = await api.createListing(data);
        console.log("Created:");
        console.log("  SKU:", result.sku);
        console.log("  Offer ID:", result.offerId);
        console.log("\nTo publish: ebay publish", result.offerId);
        break;
      }

      case "publish": {
        const offerId = args[1];
        if (!offerId) {
          console.error("Usage: ebay publish <offerId>");
          console.error("\nPublishes an offer, making it a live eBay listing.");
          console.error("Get the offer ID from: ebay create <json>");
          process.exit(1);
        }
        console.log("Publishing offer", offerId, "...");
        const result = await api.publishOffer(offerId);
        console.log("Published!");
        console.log("  Listing ID:", result.listingId);
        console.log("  URL: https://www.ebay.com/itm/" + result.listingId);
        break;
      }
```

- [ ] **Step 2: Commit**

```bash
cd /Users/murphy/workplace/VibeLyster
git add tools/ebay/cli.js
git commit -m "feat(ebay-cli): add upload, create, publish commands"
```

---

### Task 9: cli.js — Listings, listing, edit, delete commands

**Files:**
- Modify: `tools/ebay/cli.js` (add cases before `default:`)

- [ ] **Step 1: Add listings management commands**

Add these cases before `default:` in `tools/ebay/cli.js`:

```js
      case "listings": {
        const result = await api.getInventoryItems();
        if (!result.items.length) {
          console.log("No inventory items found.");
          break;
        }
        for (const item of result.items) {
          console.log(
            `[${item.sku}] ${item.title} — ${item.condition} (qty: ${item.quantity})`
          );
        }
        console.log(`\nTotal: ${result.total} items`);
        break;
      }

      case "listing": {
        const sku = args[1];
        if (!sku) {
          console.error("Usage: ebay listing <sku>");
          process.exit(1);
        }
        const item = await api.getInventoryItem(sku);
        console.log(JSON.stringify(item, null, 2));

        // Also show offer info
        try {
          const offers = await api.getOffers(sku);
          if (offers.length) {
            console.log("\nOffers:");
            for (const o of offers) {
              console.log(
                `  [${o.offerId}] $${o.price} — ${o.status}${o.listingId ? ` (listing: ${o.listingId})` : ""}`
              );
              if (o.listingId) {
                console.log(`  URL: https://www.ebay.com/itm/${o.listingId}`);
              }
            }
          }
        } catch {
          // No offers for this SKU
        }
        break;
      }

      case "edit": {
        const sku = args[1];
        const jsonFile = args[2];
        if (!sku || !jsonFile) {
          console.error("Usage: ebay edit <sku> <json-file>");
          process.exit(1);
        }
        const editData = JSON.parse(await readFile(jsonFile, "utf-8"));
        console.log("Updating listing", sku, "...");
        const editResult = await api.updateListing(sku, editData);
        console.log("Updated:");
        console.log("  SKU:", editResult.sku);
        if (editResult.offerId) {
          console.log("  Offer ID:", editResult.offerId);
        }
        break;
      }

      case "delete": {
        const sku = args[1];
        if (!sku) {
          console.error("Usage: ebay delete <sku>");
          process.exit(1);
        }
        console.log("Deleting listing", sku, "...");
        await api.deleteListing(sku);
        console.log("Deleted:", sku);
        break;
      }
```

- [ ] **Step 2: Commit**

```bash
cd /Users/murphy/workplace/VibeLyster
git add tools/ebay/cli.js
git commit -m "feat(ebay-cli): add listings, listing, edit, delete commands"
```

---

### Task 10: Example draft JSON and build

**Files:**
- Create: `tools/ebay/examples/draft.json`

- [ ] **Step 1: Create example draft payload**

Create `tools/ebay/examples/draft.json`:

```json
{
  "title": "Vintage Nike Air Max 97 Silver Bullet",
  "description": "Classic Nike Air Max 97 in the iconic Silver Bullet colorway. Size 10 US. Good condition with minor creasing on toe box. Comes with original box.",
  "condition": "USED_EXCELLENT",
  "categoryId": "15709",
  "price": "120.00",
  "quantity": 1,
  "images": [
    "https://i.ebayimg.com/images/g/REPLACE_WITH_UPLOAD_URL"
  ],
  "aspects": {
    "Brand": ["Nike"],
    "Department": ["Men"],
    "US Shoe Size": ["10"],
    "Color": ["Silver"],
    "Material": ["Synthetic"]
  },
  "merchantLocationKey": "default"
}
```

- [ ] **Step 2: Build with esbuild**

```bash
cd /Users/murphy/workplace/VibeLyster/tools/ebay
npm run build
```

Expected: `dist/cli.js` created without errors.

- [ ] **Step 3: Verify the built CLI shows help**

```bash
cd /Users/murphy/workplace/VibeLyster/tools/ebay
node dist/cli.js --help
```

Expected: Help text with all 12 commands listed.

- [ ] **Step 4: Verify the built CLI errors gracefully without env vars**

```bash
cd /Users/murphy/workplace/VibeLyster/tools/ebay
node dist/cli.js auth 2>&1
```

Expected: Error message listing the missing env vars (EBAY_APP_ID, EBAY_CERT_ID, EBAY_REFRESH_TOKEN).

- [ ] **Step 5: Commit**

```bash
cd /Users/murphy/workplace/VibeLyster
git add tools/ebay/examples/draft.json tools/ebay/dist/cli.js
git commit -m "feat(ebay-cli): add example draft.json and esbuild output"
```

---

### Task 11: CLI smoke test and VibeLyster PR gate

**Files:** None (verification only)

This task verifies the CLI works against eBay before any GrailedAgent skill work begins. Do not start Task 12 until this task is complete or explicitly deferred by the user.

- [ ] **Step 1: Set sandbox credentials**

```bash
export EBAY_SANDBOX=true
export EBAY_APP_ID="<sandbox_app_id>"
export EBAY_CERT_ID="<sandbox_cert_id>"
export EBAY_REFRESH_TOKEN="<sandbox_refresh_token>"
```

Use sandbox credentials from VibeLyster's `.env.local` (look for `EBAY_SANDBOX_*` vars). If sandbox token unavailable, use production credentials with `EBAY_SANDBOX=false` and skip create/publish (read-only commands are safe).

- [ ] **Step 2: Verify auth and SDK refresh wiring**

```bash
cd /Users/murphy/workplace/VibeLyster/tools/ebay
DEBUG=ebay:* node cli.js auth
```

Expected: "Logged in as: ..." with username and user ID. The SDK owns token refresh through `autoRefreshToken`; if a refresh occurs, the debug listener logs `[ebay-cli] SDK refreshed OAuth user token`.

- [ ] **Step 3: Verify categories**

```bash
node cli.js categories "sneakers"
```

Expected: List of category suggestions with IDs and names.

- [ ] **Step 4: Verify aspects**

```bash
node cli.js aspects 15709
```

Expected: List of required and recommended aspects for Athletic Shoes.

- [ ] **Step 5: Verify policies**

```bash
node cli.js policies
```

Expected: Lists of fulfillment, payment, and return policies (or "No policies found" message).

- [ ] **Step 6: Verify locations**

```bash
node cli.js locations
```

Expected: List of merchant locations (or "No merchant locations found" message).

- [ ] **Step 7: Verify listings**

```bash
node cli.js listings
```

Expected: List of inventory items (or "No inventory items found").

- [ ] **Step 8: If any command fails, fix the issue and re-run**

Common issues:
- `ebay-api` module resolution: may need to check esbuild externals
- API method names: hendt/ebay-api may use different method signatures than expected — check the library source
- Auth errors: sandbox vs production endpoint mismatch

- [ ] **Step 9: Rebuild after any fixes**

```bash
npm run build
node dist/cli.js --help
```

- [ ] **Step 10: Final VibeLyster commit and PR**

```bash
cd /Users/murphy/workplace/VibeLyster
git status --short
git add tools/ebay/
git commit -m "feat(ebay-cli): complete @vibelyster/ebay-cli v0.1.0"
```

Expected: the VibeLyster branch contains only CLI/package changes under `tools/ebay/`. Open the VibeLyster PR before starting the GrailedAgent skill branch.

---

### Task 12: SKILL.md — eBay listing agent skill

**Files:**
- Create: `/Users/murphy/workplace/GrailedAgent/ebay-listing/SKILL.md`
- Create: `/Users/murphy/workplace/GrailedAgent/ebay-listing/examples/draft.json`

This task is in the **GrailedAgent** repo, not VibeLyster.

- [ ] **Step 1: Check GrailedAgent worktree before branching**

```bash
cd /Users/murphy/workplace/GrailedAgent
git status --short
```

Expected: no unrelated changes that should be included in the eBay skill commit. If unrelated user work exists, leave it untouched and stage only `ebay-listing/` and the intended `CLAUDE.md` change later.

- [ ] **Step 2: Create skill branch**

```bash
cd /Users/murphy/workplace/GrailedAgent
git checkout -b feat/ebay-skill
```

- [ ] **Step 3: Create directory structure**

```bash
mkdir -p /Users/murphy/workplace/GrailedAgent/ebay-listing/examples
```

- [ ] **Step 4: Copy the example draft.json**

Create `/Users/murphy/workplace/GrailedAgent/ebay-listing/examples/draft.json` with the same content as `tools/ebay/examples/draft.json` (from Task 10 Step 1).

- [ ] **Step 5: Write SKILL.md**

Create `/Users/murphy/workplace/GrailedAgent/ebay-listing/SKILL.md`:

```markdown
---
name: ebay-listing
description: Automate eBay marketplace listings — create drafts, upload photos, publish, and manage items. Use this skill whenever the user wants to list, sell, or post items on eBay, manage their eBay inventory, update pricing, or do anything related to selling on eBay marketplace.
license: MIT
compatibility: Requires Node.js 18+ for the CLI.
metadata:
  author: vibelyster
  version: "0.1.0"
---

# eBay Listing Agent Skill

You are an eBay selling assistant. You help users list items on eBay marketplace using the `@vibelyster/ebay-cli` tool.

## Prerequisites

- **Node.js 18+**
- **Auth tokens**: `EBAY_APP_ID`, `EBAY_CERT_ID`, and `EBAY_REFRESH_TOKEN` environment variables (see Auth section)

## CLI Tool

All operations go through the `@vibelyster/ebay-cli` npm package:

` ` `bash
# Run via npx (no install needed)
npx @vibelyster/ebay-cli <command>

# Or install globally
npm install -g @vibelyster/ebay-cli
ebay <command>
` ` `

### Commands

| Command | Auth | Description |
|---------|------|-------------|
| `ebay auth` | Yes | Verify credentials (calls eBay Identity API) |
| `ebay categories <query>` | Yes | Search categories by keyword via Taxonomy API |
| `ebay aspects <categoryId>` | Yes | List required/recommended item specifics for a category |
| `ebay policies` | Yes | List fulfillment/payment/return policies |
| `ebay locations` | Yes | List merchant locations |
| `ebay upload <image-path>` | Yes | Upload image via Trading API, returns eBay-hosted URL |
| `ebay create <json-file>` | Yes | Create inventory item + offer (draft). Returns SKU + offer ID |
| `ebay publish <offerId>` | Yes | Publish offer → live listing. Returns listing ID + URL |
| `ebay listings` | Yes | List active inventory items |
| `ebay listing <sku>` | Yes | View inventory item + offer details |
| `ebay edit <sku> <json-file>` | Yes | Update inventory item + offer in-place |
| `ebay delete <sku>` | Yes | Withdraw offer + delete inventory item |

## Authentication

eBay uses OAuth2 with a refresh token. The CLI auto-refreshes access tokens — you just need to set the initial credentials.

### Required Environment Variables

| Variable | Source | Description |
|----------|--------|-------------|
| `EBAY_APP_ID` | eBay Developer Portal | Client ID (application credentials) |
| `EBAY_CERT_ID` | eBay Developer Portal | Client Secret (application credentials) |
| `EBAY_REFRESH_TOKEN` | OAuth consent flow | User refresh token (long-lived, ~18 months) |

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `EBAY_DEV_ID` | (empty) | Developer ID — needed for Trading API image upload |
| `EBAY_SANDBOX` | `false` | Set to `true` for sandbox mode |

### Setup

` ` `bash
export EBAY_APP_ID="your_client_id"
export EBAY_CERT_ID="your_client_secret"
export EBAY_REFRESH_TOKEN="your_refresh_token"
` ` `

Verify with:
` ` `bash
npx @vibelyster/ebay-cli auth
# Output: Logged in as: username
` ` `

### Agent Auth Flow

Before any authenticated operation:

1. **Check env vars.** If any of `EBAY_APP_ID`, `EBAY_CERT_ID`, `EBAY_REFRESH_TOKEN` are not set, ask the user to set them.
2. **Verify login.** Run `npx @vibelyster/ebay-cli auth`. If it fails, the refresh token may be expired (~18 months). The user needs to re-run the OAuth consent flow.
3. **Handle errors mid-session.** Token refresh is automatic. If you get persistent auth errors, ask the user to check their credentials.

## Workflow: Creating a Listing

When a user wants to list an item, follow these steps:

### Step 1: Parse User Input

Extract from the user's message:
- `title`
- `description`
- `price` (USD)
- `condition` — map to eBay enum (see Condition Mapping)
- Category keywords (to look up via `ebay categories`)
- Item specifics (brand, size, color, material, department)
- Image file paths

**If missing required fields, ask the user.** Required: title, price, at least one image, category. Strongly recommended: condition, brand, size.

### Step 2: Look Up Category

Always query eBay's Taxonomy API — do not guess category IDs:

` ` `bash
npx @vibelyster/ebay-cli categories "sneakers"
# Output:
# [15709] Men's Shoes > Athletic Shoes
# [95672] Women's Shoes > Athletic Shoes
# ...
` ` `

Pick the most relevant category. If ambiguous, ask the user.

### Step 3: Look Up Required Aspects

Get the required item specifics for the chosen category:

` ` `bash
npx @vibelyster/ebay-cli aspects 15709
# Output:
# Required:
#   Brand
#   US Shoe Size
#   Department (Men, Women, Unisex)
# Recommended:
#   Color
#   Material
#   Style
` ` `

Use this to know exactly which fields to include in the listing JSON.

### Step 4: Upload Images

Each image must be uploaded to get an eBay-hosted URL:

` ` `bash
npx @vibelyster/ebay-cli upload /path/to/photo1.jpg
# Output: Uploaded: https://i.ebayimg.com/images/g/...
` ` `

Use the returned URL in the `images` array. No square-crop requirement (unlike Depop). Minimum 500px recommended.

### Step 5: Build Listing JSON

Write a JSON file with the listing data. See examples/ for template.

` ` `json
{
  "title": "Rick Owens DRKSHDW Ramones High Top Sneakers",
  "description": "Size 43, worn twice. Excellent condition, no visible wear. Comes with original box.",
  "condition": "USED_EXCELLENT",
  "categoryId": "15709",
  "price": "450.00",
  "quantity": 1,
  "images": ["https://i.ebayimg.com/images/g/..."],
  "aspects": {
    "Brand": ["Rick Owens"],
    "Department": ["Men"],
    "US Shoe Size": ["10"],
    "Color": ["Black"],
    "Material": ["Leather"]
  },
  "merchantLocationKey": "default"
}
` ` `

**Field notes:**
- `aspects` — values are always arrays (eBay's format), even for single values
- `price` — string, in USD
- `condition` — string enum (see Condition Mapping)
- `categoryId` — from `ebay categories` lookup, always verify
- `merchantLocationKey` — from `ebay locations` lookup
- `quantity` — defaults to 1 if omitted

**Listing policies** (fulfillment, payment, return) are auto-fetched from the user's eBay account. Override with `--fulfillment-policy`, `--payment-policy`, `--return-policy` flags if needed.

#### Writing the Description

eBay buyers expect clear, detailed descriptions:
- **Title should be descriptive** — brand, item name, key details
- **Condition details** — specific wear noted, measurements if relevant
- **What's included** — "Comes with original box" or "No original packaging"
- **Material/colorway** if notable

### Step 6: Create Draft

` ` `bash
npx @vibelyster/ebay-cli create /tmp/ebay-listing.json
# Output:
# Created:
#   SKU: vl-1714567890123
#   Offer ID: 1234567890
#
# To publish: ebay publish 1234567890
` ` `

### Step 7: Publish

` ` `bash
npx @vibelyster/ebay-cli publish 1234567890
# Output:
# Published!
#   Listing ID: 123456789012
#   URL: https://www.ebay.com/itm/123456789012
` ` `

### Step 8: Confirm to User

Report back:
- Success/failure
- Listing URL if published
- SKU and offer ID if saved as draft
- Any fields that need review

## Workflow: Updating a Listing

1. **Find the listing.** Run `npx @vibelyster/ebay-cli listings` to see active items.
2. **Get current data.** Run `npx @vibelyster/ebay-cli listing <sku>` to see current fields.
3. **Build edit JSON.** Include only the fields you want to change.
4. **Edit in-place.** Run `npx @vibelyster/ebay-cli edit <sku> edit.json`.
5. **Confirm to user.** Show what changed.

## Error Recovery

| Error | Cause | Fix |
|-------|-------|-----|
| `Missing required environment variables` | Env vars not set | Set `EBAY_APP_ID`, `EBAY_CERT_ID`, `EBAY_REFRESH_TOKEN` |
| `Invalid access token` | Refresh token expired (~18 months) | Re-run OAuth consent flow for new refresh token |
| `The item specific Brand is missing` | Required aspect not provided | Run `ebay aspects <categoryId>` to see required fields |
| `Invalid category ID` | Wrong category | Run `ebay categories` to search |
| `Listing policy not found` | Policy ID doesn't exist | Run `ebay policies` to see available policies |
| `Merchant location not found` | Location key doesn't exist | Run `ebay locations` to see available locations |
| `Duplicate SKU` | SKU already in use | Timestamp-based SKUs make this unlikely; delete old item first |
| `Image upload failed` | File too large or wrong format | eBay accepts JPEG/PNG, max 12MB |
| `No fulfillment policies found` | No policies configured on eBay | Create policies at ebay.com → Account Settings |

## Gotchas & Pitfalls

| Gotcha | Detail |
|--------|--------|
| **Always query categories** | Never hardcode category IDs — use `ebay categories` every time. |
| **Aspects values are arrays** | `{"Brand": ["Nike"]}`, not `{"Brand": "Nike"}`. |
| **Check required aspects** | Each category has different required aspects — `ebay aspects <id>` tells you. |
| **Policies auto-fetched** | CLI picks the first policy of each type. Override with flags if user has multiple. |
| **SKU is auto-generated** | `vl-{timestamp}` format. Used to reference the item later. |
| **Price is a string** | `"450.00"`, not `450`. |
| **Condition is an enum** | Use exact values: `NEW`, `NEW_OTHER`, `USED_EXCELLENT`, `USED_ACCEPTABLE`, etc. |
| **Images are URLs** | Upload first with `ebay upload`, then use returned URLs in listing JSON. |
| **Merchant location required** | Must have at least one location set up on eBay account. |

## Condition Mapping

| User says | CLI enum | eBay condition ID |
|-----------|----------|-------------------|
| new, brand new, nwt, deadstock | `NEW` | 1000 |
| like new, open box, excellent | `NEW_OTHER` | 1500 |
| gently used, used, good | `USED_EXCELLENT` | 3000 |
| heavily used, worn, fair | `USED_ACCEPTABLE` | 7000 |

## Common Categories (Quick Reference)

**Always verify with `ebay categories <query>` — these are hints, not source of truth.**

| Item type | Typical category ID | Category name |
|-----------|-------------------|---------------|
| T-shirt | 15687 | Men's T-Shirts |
| Shirt | 57990 | Men's Casual Shirts |
| Hoodie | 155183 | Men's Sweats & Hoodies |
| Sweater | 11484 | Men's Sweaters |
| Jacket | 57988 | Men's Coats, Jackets & Vests |
| Coat | 63862 | Men's Coats & Jackets |
| Jeans | 11483 | Men's Jeans |
| Pants | 57989 | Men's Pants |
| Shorts | 15689 | Men's Shorts |
| Sneakers | 15709 | Men's Athletic Shoes |
| Boots | 53557 | Men's Boots |
| Dress shoes | 53120 | Men's Dress Shoes |
| Bag | 169291 | Men's Bags |
| Wallet | 2996 | Men's Wallets |
| Belt | 2993 | Men's Belts |
| Hat | 29960 | Men's Hats |
| Watch | 31387 | Wristwatches |

## Example Interaction

**User:** "List my Rick Owens Ramones on eBay, size 43, $450, worn twice" + [image files]

**Agent:**
1. **Check auth**: `npx @vibelyster/ebay-cli auth` → "Logged in as: username"
2. **Look up category**: `npx @vibelyster/ebay-cli categories "rick owens sneakers"` → `[15709] Men's Athletic Shoes`
3. **Check required aspects**: `npx @vibelyster/ebay-cli aspects 15709` → Brand (required), US Shoe Size (required), Department (required)
4. **Upload images**: `npx @vibelyster/ebay-cli upload photo1.jpg` → URL
5. **Build JSON** with aspects: `{"Brand": ["Rick Owens"], "US Shoe Size": ["10"], "Department": ["Men"]}`
6. **Write** to `/tmp/ebay-listing.json`
7. **Create**: `npx @vibelyster/ebay-cli create /tmp/ebay-listing.json` → SKU: vl-..., Offer ID: 123...
8. **Report**: "Draft created! SKU: vl-..., Offer ID: 123... Want me to publish it?"

**User:** "Publish it"

**Agent:**
1. `npx @vibelyster/ebay-cli publish 1234567890`
2. Report: "Published! URL: https://www.ebay.com/itm/123456789012"

**User:** "Drop the price to $380"

**Agent:**
1. `npx @vibelyster/ebay-cli listing vl-...` → get current data
2. Modify price to `"380.00"`, write to `/tmp/ebay-edit.json`
3. `npx @vibelyster/ebay-cli edit vl-... /tmp/ebay-edit.json`
4. Report: "Updated! Price dropped to $380."
```

**Note:** Replace ` ` ` with actual triple backticks in the file. The spaces are only in this plan to avoid nesting issues.

- [ ] **Step 6: Commit in GrailedAgent repo**

```bash
cd /Users/murphy/workplace/GrailedAgent
git add ebay-listing/
git commit -m "feat: add ebay-listing agent skill"
```

---

### Task 13: Update GrailedAgent CLAUDE.md

**Files:**
- Modify: `/Users/murphy/workplace/GrailedAgent/CLAUDE.md`

- [ ] **Step 1: Add ebay-listing to the architecture diagram and key files**

In the Architecture section, add `ebay-listing/` directory:

```
├── ebay-listing/
│   ├── SKILL.md                 # eBay skill — agent reads this to operate
│   └── examples/
│       └── draft.json           # Draft listing payload template
```

In the Key Files section, add:

```
- `ebay-listing/SKILL.md` — eBay agent skill. Workflow, field reference, category lookup, gotchas.
```

- [ ] **Step 2: Commit**

```bash
cd /Users/murphy/workplace/GrailedAgent
git add CLAUDE.md
git commit -m "docs: add ebay-listing to CLAUDE.md architecture"
```

---
