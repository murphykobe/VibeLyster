#!/usr/bin/env node

/**
 * eBay CLI — VibeLyster
 *
 * Auth: Run `ebay login`, or set EBAY_REFRESH_TOKEN for headless use.
 */

import * as api from "./ebay-api.js";
import { readFile } from "node:fs/promises";

function getFlagValue(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

function cleanArgs(args) {
  const cleaned = [];
  const valueFlags = [
    "--fulfillment-policy",
    "--payment-policy",
    "--return-policy",
    "--sku",
  ];
  let i = 0;
  while (i < args.length) {
    if (valueFlags.includes(args[i])) i += 2;
    else cleaned.push(args[i++]);
  }
  return cleaned;
}

async function readJsonFile(path) {
  return JSON.parse(await readFile(path, "utf-8"));
}

function policyOptions(rawArgs) {
  return {
    fulfillmentPolicyId: getFlagValue(rawArgs, "--fulfillment-policy"),
    paymentPolicyId: getFlagValue(rawArgs, "--payment-policy"),
    returnPolicyId: getFlagValue(rawArgs, "--return-policy"),
  };
}

function printHelp() {
  console.log(`eBay CLI — VibeLyster

Commands:
  login [code-or-url]           Start OAuth login or exchange callback code
  logout                        Remove saved eBay credentials
  auth                         Verify credentials
  categories <query>           Search eBay categories
  aspects <categoryId>         List category item specifics
  policies                     List fulfillment/payment/return policies
  locations                    List merchant locations
  upload <image-path>          Upload image, returns eBay-hosted URL
  create <json-file>           Create inventory item + offer draft
                               [--sku <sku>] [--fulfillment-policy <id>]
                               [--payment-policy <id>] [--return-policy <id>]
  publish <offerId>            Publish offer to a live listing
  listings                     List inventory items
  listing <sku>                View inventory item + offer details
  edit <sku> <json-file>       Update inventory item + offer
  delete <sku>                 Withdraw offer and delete inventory item

Auth:
  Set EBAY_APP_ID, EBAY_CERT_ID, and EBAY_RU_NAME, then run "ebay login".
  Optional: EBAY_REFRESH_TOKEN for headless use, EBAY_DEV_ID for image upload,
  EBAY_SANDBOX=true for sandbox endpoints.
`);
}

function printCategories(categories) {
  if (!categories.length) {
    console.log("No categories found.");
    return;
  }
  for (const category of categories.slice(0, 5)) {
    const ancestors = category.categoryTreeNodeAncestors
      .map((ancestor) => ancestor.categoryName)
      .reverse();
    const path = [...ancestors, category.categoryName].filter(Boolean).join(" > ");
    console.log(`[${category.categoryId}] ${path || category.categoryName}`);
  }
}

function printAspects(aspects) {
  const required = aspects.filter((aspect) => aspect.required);
  const recommended = aspects.filter(
    (aspect) => !aspect.required && aspect.recommended
  );

  console.log("Required:");
  for (const aspect of required) {
    console.log(`  ${aspect.name}${formatValues(aspect.values)}`);
  }

  console.log("\nRecommended:");
  for (const aspect of recommended) {
    console.log(`  ${aspect.name}${formatValues(aspect.values)}`);
  }
}

function formatValues(values) {
  if (!values?.length) return "";
  return ` (${values.slice(0, 12).join(", ")}${values.length > 12 ? ", ..." : ""})`;
}

function printPolicies(policies) {
  console.log("Fulfillment:");
  for (const policy of policies.fulfillment) {
    console.log(`  ${policy.name} (${policy.fulfillmentPolicyId})`);
  }
  if (!policies.fulfillment.length) console.log("  No fulfillment policies found.");

  console.log("\nPayment:");
  for (const policy of policies.payment) {
    console.log(`  ${policy.name} (${policy.paymentPolicyId})`);
  }
  if (!policies.payment.length) console.log("  No payment policies found.");

  console.log("\nReturn:");
  for (const policy of policies.return) {
    console.log(`  ${policy.name} (${policy.returnPolicyId})`);
  }
  if (!policies.return.length) console.log("  No return policies found.");
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const args = cleanArgs(rawArgs);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  try {
    switch (command) {
      case "login": {
        const codeOrUrl = args.slice(1).join(" ");
        if (codeOrUrl) {
          await api.exchangeAuthorizationCode(codeOrUrl);
          console.log("Logged in. Credentials saved to:", api.getConfigFile());
          break;
        }

        const url = api.generateLoginUrl();
        console.log("Open this URL and approve eBay access:\n");
        console.log(url);
        console.log("\nAfter eBay redirects back, run:");
        console.log('  ebay login "<full callback URL or code>"');
        break;
      }

      case "logout": {
        api.clearAuthToken();
        console.log("Logged out. Credentials removed from:", api.getConfigFile());
        break;
      }

      case "auth": {
        const auth = await api.checkAuth();
        console.log(`Logged in as: ${auth.username}`);
        console.log(`User ID: ${auth.userId}`);
        break;
      }

      case "categories": {
        const query = args.slice(1).join(" ");
        if (!query) throw new Error("Usage: ebay categories <query>");
        printCategories(await api.searchCategories(query));
        break;
      }

      case "aspects": {
        const categoryId = args[1];
        if (!categoryId) throw new Error("Usage: ebay aspects <categoryId>");
        printAspects(await api.getAspects(categoryId));
        break;
      }

      case "policies": {
        printPolicies(await api.getPolicies());
        break;
      }

      case "locations": {
        const locations = await api.getLocations();
        if (!locations.length) {
          console.log("No merchant locations found.");
          break;
        }
        for (const location of locations) {
          const key = location.merchantLocationKey || location.name || "(unknown)";
          const status = location.merchantLocationStatus || location.status || "";
          console.log(`${key}${status ? ` — ${status}` : ""}`);
        }
        break;
      }

      case "upload": {
        const imagePath = args[1];
        if (!imagePath) throw new Error("Usage: ebay upload <image-path>");
        console.log("Uploaded:", await api.uploadImage(imagePath));
        break;
      }

      case "create": {
        const jsonPath = args[1];
        if (!jsonPath) throw new Error("Usage: ebay create <json-file>");
        const result = await api.createListing(await readJsonFile(jsonPath), {
          ...policyOptions(rawArgs),
          sku: getFlagValue(rawArgs, "--sku"),
        });
        console.log("Created:");
        console.log(`  SKU: ${result.sku}`);
        console.log(`  Offer ID: ${result.offerId}`);
        console.log(`\nTo publish: ebay publish ${result.offerId}`);
        break;
      }

      case "publish": {
        const offerId = args[1];
        if (!offerId) throw new Error("Usage: ebay publish <offerId>");
        const result = await api.publishListing(offerId);
        console.log("Published!");
        console.log(`  Listing ID: ${result.listingId}`);
        if (result.url) console.log(`  URL: ${result.url}`);
        break;
      }

      case "listings": {
        const listings = await api.listListings();
        if (!listings.length) {
          console.log("No inventory items found.");
          break;
        }
        for (const item of listings) {
          const sku = item.sku || item.inventoryItemGroupKey;
          const title = item.product?.title || "(untitled)";
          console.log(`[${sku}] ${title}`);
        }
        break;
      }

      case "listing": {
        const sku = args[1];
        if (!sku) throw new Error("Usage: ebay listing <sku>");
        console.log(JSON.stringify(await api.getListing(sku), null, 2));
        break;
      }

      case "edit": {
        const sku = args[1];
        const jsonPath = args[2];
        if (!sku || !jsonPath) throw new Error("Usage: ebay edit <sku> <json-file>");
        const result = await api.editListing(sku, await readJsonFile(jsonPath), {
          ...policyOptions(rawArgs),
        });
        console.log("Updated:");
        console.log(`  SKU: ${result.sku}`);
        console.log(`  Offer ID: ${result.offerId}`);
        break;
      }

      case "delete": {
        const sku = args[1];
        if (!sku) throw new Error("Usage: ebay delete <sku>");
        await api.deleteListing(sku);
        console.log(`Deleted: ${sku}`);
        break;
      }

      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

main();
