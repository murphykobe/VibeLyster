#!/usr/bin/env node

/**
 * Depop CLI — VibeLyster
 *
 * Usage:
 *   depop login                          Save your access token
 *   depop auth                           Check login status
 *   depop logout                         Remove saved credentials
 *   depop listings                       List your products
 *   depop listing <slug>                 Get product details
 *   depop addresses                      List shipping addresses
 *   depop categories                     List categories (group → productType)
 *   depop conditions                     List valid condition values
 *   depop shipping                       List shipping providers and parcel sizes
 *   depop upload <image-path>            Upload a square image, returns {id, url}
 *   depop create <json-file>             Create a draft listing
 *   depop drafts                         List draft listings
 *   depop draft-update <id> <json-file>  Update a draft
 *   depop draft-delete <id>              Delete a draft
 *   depop edit <product-id> <json-file>  Edit a live product in-place
 *   depop delete <product-id>            Delete a live product
 *
 * Auth: Run `depop login` and paste your access_token from browser cookies.
 *       Token is saved to ~/.vibelyster/depop.json.
 *       Alternatively, set DEPOP_ACCESS_TOKEN env var.
 *
 * Image note: Depop requires SQUARE images. Crop before uploading.
 */

import * as api from "./depop-api.js";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { join } from "node:path";

const DEPOP_BASE = "https://www.depop.com";
const CONFIG_DIR = join(homedir(), ".vibelyster");
const CONFIG_FILE = join(CONFIG_DIR, "depop.json");

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function loadSavedAuth() {
  try {
    const data = JSON.parse(await readFile(CONFIG_FILE, "utf-8"));
    if (data.accessToken) return data;
  } catch {
    // No saved auth
  }
  return null;
}

async function saveAuth(authData) {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(authData, null, 2));
}

async function clearAuth() {
  try {
    await unlink(CONFIG_FILE);
  } catch {
    // File doesn't exist
  }
}

async function getAccessToken(args) {
  const token =
    getFlagValue(args, "--access-token") ||
    process.env.DEPOP_ACCESS_TOKEN;
  if (token) return token;

  const saved = await loadSavedAuth();
  if (saved) return saved.accessToken;

  console.error(
    "Error: Not logged in. Run `depop login` or set DEPOP_ACCESS_TOKEN env var."
  );
  process.exit(1);
}

async function getUserId(args) {
  // Check saved auth first (cached userId avoids extra API call)
  const saved = await loadSavedAuth();
  if (saved?.userId) return saved.userId;

  // Resolve from API
  const token = await getAccessToken(args);
  const userId = await api.resolveUserId(token);

  // Cache it for next time
  if (saved) {
    saved.userId = userId;
    await saveAuth(saved);
  }

  return userId;
}

function getFlagValue(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

function cleanArgs(args) {
  const cleaned = [];
  const valueFlags = ["--access-token", "--status"];
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
  login                           Save your access token
  auth                            Check login status
  logout                          Remove saved credentials
  listings                        List your products
  listing <slug>                  Get product details
  addresses                       List shipping addresses
  categories                      List categories (group → productType)
  conditions                      List valid condition values and colors
  shipping                        List shipping providers and parcel sizes
  upload <image-path>             Upload a square image, returns {id, url}
  create <json-file>              Create a draft listing
  drafts                          List draft listings
  draft-update <id> <json-file>   Update a draft
  draft-delete <id>               Delete a draft
  edit <product-id> <json-file>   Edit a live product in-place
  delete <product-id>             Delete a live product

Auth:
  Run "depop login" and paste your access_token from browser cookies.
  Token saved to ~/.vibelyster/depop.json. userId auto-resolved.
  Or set DEPOP_ACCESS_TOKEN env var.

Note: Images must be square. Crop before uploading.
`);
    return;
  }

  try {
    switch (command) {
      case "login": {
        console.log("Depop Login\n");
        console.log("To get your access token:");
        console.log("  1. Log in to depop.com in your browser");
        console.log("  2. Open DevTools → Application → Cookies → depop.com");
        console.log("  3. Copy the 'access_token' cookie value\n");

        const accessToken = await prompt("access_token: ");
        if (!accessToken) { console.error("access_token is required."); process.exit(1); }

        console.log("\nVerifying...");
        const check = await api.checkLogin(accessToken);

        if (!check.loggedIn) {
          console.error("Login failed:", check.error);
          process.exit(1);
        }

        console.log("Resolving user ID...");
        const userId = await api.resolveUserId(accessToken);

        await saveAuth({ accessToken, userId, savedAt: new Date().toISOString() });
        console.log(`\nLogged in! canSell: ${check.user.canSell}`);
        console.log(`User ID: ${userId}`);
        console.log(`Credentials saved to ${CONFIG_FILE}`);
        break;
      }

      case "auth": {
        const accessToken = await getAccessToken(rawArgs);
        const result = await api.checkLogin(accessToken);
        if (result.loggedIn) {
          const userId = await getUserId(rawArgs);
          console.log("Logged in. User ID:", userId);
          console.log("canSell:", result.user.canSell);
          console.log("stripe:", result.user.stripe?.isConnected ? "connected" : "not connected");

          const saved = await loadSavedAuth();
          if (saved) {
            console.log(`Credentials: ${CONFIG_FILE}`);
            if (saved.savedAt) console.log("Saved at:", saved.savedAt);
          } else {
            console.log("Credentials: environment variables");
          }
        } else {
          console.error("Not logged in:", result.error);
          process.exit(1);
        }
        break;
      }

      case "logout": {
        await clearAuth();
        console.log("Logged out. Credentials removed from", CONFIG_FILE);
        break;
      }

      case "listings": {
        const accessToken = await getAccessToken(rawArgs);
        const userId = await getUserId(rawArgs);
        const result = await api.getListings(accessToken, userId);
        const items = result.products || result.objects || [];
        if (!items.length) {
          console.log("No listings found.");
          break;
        }
        for (const item of items) {
          const desc = (item.description || "(no title)").split("\n")[0].slice(0, 60);
          const slug = item.slug || item.id;
          console.log(`[${slug}] ${desc} — ${item.status}`);
          console.log(`  ${DEPOP_BASE}/products/${slug}/`);
        }
        console.log(`\nTotal: ${items.length} listings`);
        break;
      }

      case "listing": {
        const slug = args[1];
        if (!slug) {
          console.error("Usage: depop listing <slug>");
          process.exit(1);
        }
        const accessToken = await getAccessToken(rawArgs);
        const result = await api.getProduct(slug, accessToken);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "addresses": {
        const accessToken = await getAccessToken(rawArgs);
        const result = await api.getAddresses(accessToken);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "categories": {
        const accessToken = await getAccessToken(rawArgs);
        const groups = await api.getCategories(accessToken);
        for (const [groupId, group] of Object.entries(groups)) {
          if (!group.product_types?.length) continue;
          const depts = (group.department || []).join(", ");
          console.log(`\n${groupId} (${depts}):`);
          for (const pt of group.product_types) {
            const name = pt.name_i18n?.["en-US"] || pt.name_i18n?.en || pt.id;
            console.log(`  ${pt.id} — ${name}`);
          }
        }
        break;
      }

      case "conditions": {
        const accessToken = await getAccessToken(rawArgs);
        const attrs = await api.getProductAttributes(accessToken);
        console.log("Conditions:");
        for (const c of attrs.condition || []) {
          console.log(`  ${c.id} — ${c.nameI18N} (${c.descriptionI18N})`);
        }
        console.log("\nColors (max " + (attrs.settings?.maxColours || 2) + "):");
        for (const c of attrs.colour || []) {
          console.log(`  ${c.id} — ${c.nameI18N}`);
        }
        break;
      }

      case "shipping": {
        const accessToken = await getAccessToken(rawArgs);
        const providers = await api.getShippingProviders(accessToken);
        for (const provider of providers) {
          console.log(`${provider.id}:`);
          for (const size of provider.parcelSizes || []) {
            console.log(`  ${size.id} — ${size.title} (${size.subtitle}) $${size.cost?.amount}`);
          }
        }
        break;
      }

      case "upload": {
        const imagePath = args[1];
        if (!imagePath) {
          console.error("Usage: depop upload <image-path>");
          console.error("\nImage must be square. Depop will reject non-square images.");
          process.exit(1);
        }
        const accessToken = await getAccessToken(rawArgs);
        const result = await api.uploadImage(imagePath, accessToken);
        console.log("Uploaded:");
        console.log("  ID:", result.id);
        console.log("  URL:", result.url || result.imageUrl || JSON.stringify(result));
        break;
      }

      case "create": {
        const jsonFile = args[1];
        if (!jsonFile) {
          console.error("Usage: depop create <json-file>");
          console.error("\nSee examples/draft.json for the payload format.");
          process.exit(1);
        }
        const accessToken = await getAccessToken(rawArgs);
        const draftData = JSON.parse(await readFile(jsonFile, "utf-8"));
        console.log("Creating draft...");
        const draft = await api.createDraft(draftData, accessToken);
        console.log("Draft created:", draft.id);
        console.log("\nTo publish, open the draft in your browser:");
        console.log(`  ${DEPOP_BASE}/sellinghub/drafts/edit/${draft.id}/`);
        console.log("\nOr update it via: depop draft-update <draft-id> <json-file>");
        break;
      }

      case "drafts": {
        const accessToken = await getAccessToken(rawArgs);
        const result = await api.getDrafts(accessToken);
        const items = result.drafts || [];
        if (!items.length) {
          console.log("No drafts found.");
          break;
        }
        for (const item of items) {
          const desc = (item.description || "(no description)").split("\n")[0].slice(0, 60);
          const price = item.priceAmount ? `$${item.priceAmount}` : "?";
          const missing = item.missingFields?.length ? ` [missing: ${item.missingFields.join(", ")}]` : " [ready]";
          console.log(`[${item.id}] ${desc} — ${price}${missing}`);
        }
        console.log(`\nTotal: ${items.length} drafts`);
        break;
      }

      case "draft-update": {
        const draftId = args[1];
        const jsonFile = args[2];
        if (!draftId || !jsonFile) {
          console.error("Usage: depop draft-update <draft-id> <json-file>");
          process.exit(1);
        }
        const accessToken = await getAccessToken(rawArgs);
        const draftData = JSON.parse(await readFile(jsonFile, "utf-8"));
        await api.updateDraft(draftId, draftData, accessToken);
        console.log("Draft updated:", draftId);
        console.log(`  ${DEPOP_BASE}/sellinghub/drafts/edit/${draftId}/`);
        break;
      }

      case "draft-delete": {
        const draftId = args[1];
        if (!draftId) {
          console.error("Usage: depop draft-delete <draft-id>");
          process.exit(1);
        }
        const accessToken = await getAccessToken(rawArgs);
        await api.deleteDraft(draftId, accessToken);
        console.log("Draft deleted:", draftId);
        break;
      }

      case "edit": {
        const productId = args[1];
        const jsonFile = args[2];
        if (!productId || !jsonFile) {
          console.error("Usage: depop edit <product-id> <json-file>");
          process.exit(1);
        }
        const accessToken = await getAccessToken(rawArgs);
        const editData = JSON.parse(await readFile(jsonFile, "utf-8"));
        const result = await api.editProduct(productId, editData, accessToken);
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
        const accessToken = await getAccessToken(rawArgs);
        await api.deleteProduct(productId, accessToken);
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
