#!/usr/bin/env node

/**
 * Depop CLI — VibeLyster
 *
 * Usage:
 *   depop auth                           Check login status
 *   depop listings [--status <filter>]   List your products (default: selling)
 *   depop listing <id>                   Get product details
 *   depop addresses                      List shipping addresses
 *   depop upload <image-path>            Upload a square image, returns {id, url}
 *   depop create <json-file>             Create a product listing
 *   depop edit <product-id> <json-file>  Edit a live product in-place
 *   depop delete <product-id>            Delete a product
 *
 * Auth: Set DEPOP_ACCESS_TOKEN, DEPOP_USER_ID, and DEPOP_COOKIES env vars.
 *
 * To get your tokens:
 *   1. Log into depop.com in your browser
 *   2. Open DevTools > Application > Cookies
 *   3. Copy: access_token, user_id, _px2 (and all other cookies as a string)
 *
 * Image note: Depop requires SQUARE images. Crop before uploading.
 */

import * as api from "./depop-api.js";
import { readFile } from "node:fs/promises";

const DEPOP_BASE = "https://www.depop.com";

function getAuth(args) {
  const accessToken =
    getFlagValue(args, "--access-token") || process.env.DEPOP_ACCESS_TOKEN;
  const userId =
    getFlagValue(args, "--user-id") || process.env.DEPOP_USER_ID;
  const cookies =
    getFlagValue(args, "--cookies") || process.env.DEPOP_COOKIES;

  if (!accessToken || !userId || !cookies) {
    console.error(
      "Error: Authentication required.\n\n" +
        "Set DEPOP_ACCESS_TOKEN, DEPOP_USER_ID, and DEPOP_COOKIES env vars.\n\n" +
        "To get these values:\n" +
        "  1. Log into depop.com in your browser\n" +
        "  2. Open DevTools > Application > Cookies\n" +
        "  3. Copy access_token, user_id, and all cookies as a string\n\n" +
        "Important: Include the _px2 cookie in DEPOP_COOKIES — Depop uses\n" +
        "PerimeterX anti-bot detection and will block requests without it."
    );
    process.exit(1);
  }
  return { accessToken, userId, cookies };
}

function getFlagValue(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

function cleanArgs(args) {
  const cleaned = [];
  const valueFlags = ["--access-token", "--user-id", "--cookies", "--status"];
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
    console.log(`Depop CLI — VibeLyster

Commands:
  auth                            Check login status
  listings [--status <filter>]    List your products (selling, sold, all)
  listing <id>                    Get product details
  addresses                       List shipping addresses
  upload <image-path>             Upload a square image, returns {id, url}
  create <json-file>              Create a product listing
  edit <product-id> <json-file>   Edit a live product in-place
  delete <product-id>             Delete a product

Auth:
  Set DEPOP_ACCESS_TOKEN, DEPOP_USER_ID, and DEPOP_COOKIES env vars
  Or pass --access-token <token> --user-id <id> --cookies <cookies>

Note: Images must be square. Crop before uploading.
`);
    return;
  }

  try {
    switch (command) {
      case "auth": {
        const { accessToken, userId, cookies } = getAuth(rawArgs);
        const result = await api.checkLogin(accessToken, userId, cookies);
        if (result.loggedIn) {
          const u = result.user;
          console.log("Logged in as:", u.username || u.name || "(unknown)");
          console.log("User ID:", userId);
          if (u.email) console.log("Email:", u.email);
        } else {
          console.error("Not logged in:", result.error);
          process.exit(1);
        }
        break;
      }

      case "listings": {
        const { accessToken, userId, cookies } = getAuth(rawArgs);
        const statusFilter = getFlagValue(rawArgs, "--status") || "selling";
        const result = await api.getListings(accessToken, userId, cookies, statusFilter);
        const items = result.objects || result.products || result || [];
        if (!items.length) {
          console.log(`No ${statusFilter} listings found.`);
          break;
        }
        for (const item of items) {
          const price = item.price ? `$${(item.price.priceAmount / 100).toFixed(2)}` : "?";
          console.log(`[${item.id}] ${item.description?.slice(0, 60) || "(no title)"} — ${price}`);
          console.log(`  ${DEPOP_BASE}/products/${item.slug || item.id}/`);
        }
        console.log(`\nTotal: ${items.length} listings`);
        break;
      }

      case "listing": {
        const productId = args[1];
        if (!productId) {
          console.error("Usage: depop listing <id>");
          process.exit(1);
        }
        const { accessToken, userId, cookies } = getAuth(rawArgs);
        const result = await api.getProduct(productId, accessToken, userId, cookies);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "addresses": {
        const { accessToken, userId, cookies } = getAuth(rawArgs);
        const result = await api.getAddresses(accessToken, userId, cookies);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "upload": {
        const imagePath = args[1];
        if (!imagePath) {
          console.error("Usage: depop upload <image-path>");
          console.error("\nImage must be square. Depop will reject non-square images.");
          process.exit(1);
        }
        const { accessToken, userId, cookies } = getAuth(rawArgs);
        const result = await api.uploadImage(imagePath, accessToken, userId, cookies);
        console.log("Uploaded:");
        console.log("  ID:", result.id);
        console.log("  URL:", result.url || result.imageUrl || JSON.stringify(result));
        break;
      }

      case "create": {
        const jsonFile = args[1];
        if (!jsonFile) {
          console.error("Usage: depop create <json-file>");
          console.error("\nSee examples/listing.json for the payload format.");
          process.exit(1);
        }
        const { accessToken, userId, cookies } = getAuth(rawArgs);
        const productData = JSON.parse(await readFile(jsonFile, "utf-8"));
        const result = await api.createProduct(productData, accessToken, userId, cookies);
        console.log("Created listing:");
        console.log("  ID:", result.id);
        console.log("  URL:", `${DEPOP_BASE}/products/${result.slug || result.id}/`);
        break;
      }

      case "edit": {
        const productId = args[1];
        const jsonFile = args[2];
        if (!productId || !jsonFile) {
          console.error("Usage: depop edit <product-id> <json-file>");
          process.exit(1);
        }
        const { accessToken, userId, cookies } = getAuth(rawArgs);
        const editData = JSON.parse(await readFile(jsonFile, "utf-8"));
        const result = await api.editProduct(productId, editData, accessToken, userId, cookies);
        console.log("Updated listing:");
        console.log("  ID:", result.id);
        console.log("  URL:", `${DEPOP_BASE}/products/${result.slug || result.id}/`);
        break;
      }

      case "delete": {
        const productId = args[1];
        if (!productId) {
          console.error("Usage: depop delete <product-id>");
          process.exit(1);
        }
        const { accessToken, userId, cookies } = getAuth(rawArgs);
        await api.deleteProduct(productId, accessToken, userId, cookies);
        console.log(`Deleted product ${productId}`);
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        console.error('Run "depop --help" for usage.');
        process.exit(1);
    }
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
}

main();
