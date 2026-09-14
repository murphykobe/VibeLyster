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
 *
 * --json: every command except the interactive `login` accepts --json to
 * emit exactly one JSON document on stdout instead of the human-readable
 * text above, and nothing else on stdout. Without --json, output is
 * unchanged from before this flag existed.
 *
 * Exit codes (apply regardless of --json):
 *   0  success
 *   1  an ordinary error (bad usage, an application-level API error)
 *   3  TOKEN_EXPIRED — the access token is invalid or expired
 *   4  CLOUDFLARE_BLOCK — Cloudflare's edge answered, not Depop's backend
 * See classifyError() in depop-api.js, the single source of truth for
 * this classification (mirrors grailed-cli's contract).
 */

import * as api from "./depop-api.js";
import { classifyError } from "./depop-api.js";
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

async function getAccessToken(args, json) {
  const token = getFlagValue(args, "--access-token") || process.env.DEPOP_ACCESS_TOKEN;
  if (token) return token;

  const saved = await loadSavedAuth();
  if (saved) return saved.accessToken;

  fail("Not logged in. Run `depop login` or set DEPOP_ACCESS_TOKEN env var.", json);
}

async function getUserId(args, json) {
  // Check saved auth first (cached userId avoids extra API call)
  const saved = await loadSavedAuth();
  if (saved?.userId) return saved.userId;

  // Resolve from API
  const token = await getAccessToken(args, json);
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

function hasFlag(args, flag) {
  return args.includes(flag);
}

/** Usage/config error: always exit 1. */
function fail(message, json) {
  if (json) {
    console.log(JSON.stringify({ error: message }));
  } else {
    console.error("Error:", message);
  }
  process.exit(1);
}

function usage(lines, json) {
  if (json) {
    console.log(JSON.stringify({ error: lines[0] }));
  } else {
    for (const line of lines) console.error(line);
  }
  process.exit(1);
}

/** Central error output for anything thrown by depop-api.js. */
function printError(e, json) {
  const c = classifyError(e);
  if (json) {
    const doc =
      c.key === "TOKEN_EXPIRED" || c.key === "CLOUDFLARE_BLOCK"
        ? { error: c.key }
        : { error: e.message, status: c.status };
    console.log(JSON.stringify(doc));
  } else {
    console.error("Error:", e.message);
  }
  process.exit(c.exitCode);
}

function cleanArgs(args) {
  const cleaned = [];
  const valueFlags = ["--access-token", "--status"];
  const boolFlags = ["--json"];
  let i = 0;
  while (i < args.length) {
    if (valueFlags.includes(args[i])) {
      i += 2;
    } else if (boolFlags.includes(args[i])) {
      i++;
    } else {
      cleaned.push(args[i]);
      i++;
    }
  }
  return cleaned;
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const json = hasFlag(rawArgs, "--json");
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

Every command except login accepts --json for machine-readable output.

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
        // Interactive only — an agent never calls this, so it does not
        // support --json.
        console.log("Depop Login\n");
        console.log("To get your access token:");
        console.log("  1. Log in to depop.com in your browser");
        console.log("  2. Open DevTools → Application → Cookies → depop.com");
        console.log("  3. Copy the 'access_token' cookie value\n");

        const accessToken = await prompt("access_token: ");
        if (!accessToken) {
          console.error("access_token is required.");
          process.exit(1);
        }

        console.log("\nVerifying...");
        const check = await api.checkLogin(accessToken);

        if (!check.loggedIn) {
          console.error("Login failed:", check.error);
          process.exit(check.exitCode ?? 1);
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
        const accessToken = await getAccessToken(rawArgs, json);
        const result = await api.checkLogin(accessToken);
        if (result.loggedIn) {
          const userId = await getUserId(rawArgs, json);
          const saved = await loadSavedAuth();
          if (json) {
            console.log(
              JSON.stringify({
                loggedIn: true,
                userId,
                canSell: result.user.canSell,
                stripeConnected: !!result.user.stripe?.isConnected,
              })
            );
          } else {
            console.log("Logged in. User ID:", userId);
            console.log("canSell:", result.user.canSell);
            console.log("stripe:", result.user.stripe?.isConnected ? "connected" : "not connected");
            if (saved) {
              console.log(`Credentials: ${CONFIG_FILE}`);
              if (saved.savedAt) console.log("Saved at:", saved.savedAt);
            } else {
              console.log("Credentials: environment variables");
            }
          }
        } else {
          if (json) {
            const doc =
              result.key === "TOKEN_EXPIRED" || result.key === "CLOUDFLARE_BLOCK"
                ? { error: result.key }
                : { error: result.error };
            console.log(JSON.stringify(doc));
          } else {
            console.error("Not logged in:", result.error);
          }
          process.exit(result.exitCode ?? 1);
        }
        break;
      }

      case "logout": {
        await clearAuth();
        if (json) {
          console.log(JSON.stringify({ loggedOut: true }));
        } else {
          console.log("Logged out. Credentials removed from", CONFIG_FILE);
        }
        break;
      }

      case "listings": {
        const accessToken = await getAccessToken(rawArgs, json);
        const userId = await getUserId(rawArgs, json);
        const result = await api.getListings(accessToken, userId);
        const items = result.products || result.objects || [];
        if (json) {
          console.log(JSON.stringify({ listings: items, total: items.length }));
        } else if (!items.length) {
          console.log("No listings found.");
        } else {
          for (const item of items) {
            const desc = (item.description || "(no title)").split("\n")[0].slice(0, 60);
            const slug = item.slug || item.id;
            console.log(`[${slug}] ${desc} — ${item.status}`);
            console.log(`  ${DEPOP_BASE}/products/${slug}/`);
          }
          console.log(`\nTotal: ${items.length} listings`);
        }
        break;
      }

      case "listing": {
        const slug = args[1];
        if (!slug) usage(["Usage: depop listing <slug>"], json);
        const accessToken = await getAccessToken(rawArgs, json);
        const result = await api.getProduct(slug, accessToken);
        if (json) {
          console.log(JSON.stringify({ listing: result }));
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      }

      case "addresses": {
        const accessToken = await getAccessToken(rawArgs, json);
        const result = await api.getAddresses(accessToken);
        if (json) {
          console.log(JSON.stringify({ addresses: result }));
        } else {
          console.log(JSON.stringify(result, null, 2));
        }
        break;
      }

      case "categories": {
        const accessToken = await getAccessToken(rawArgs, json);
        const groups = await api.getCategories(accessToken);
        if (json) {
          console.log(JSON.stringify({ categories: groups }));
        } else {
          for (const [groupId, group] of Object.entries(groups)) {
            if (!group.product_types?.length) continue;
            const depts = (group.department || []).join(", ");
            console.log(`\n${groupId} (${depts}):`);
            for (const pt of group.product_types) {
              const name = pt.name_i18n?.["en-US"] || pt.name_i18n?.en || pt.id;
              console.log(`  ${pt.id} — ${name}`);
            }
          }
        }
        break;
      }

      case "conditions": {
        const accessToken = await getAccessToken(rawArgs, json);
        const attrs = await api.getProductAttributes(accessToken);
        if (json) {
          console.log(JSON.stringify({ conditions: attrs.condition || [], colours: attrs.colour || [] }));
        } else {
          console.log("Conditions:");
          for (const c of attrs.condition || []) {
            console.log(`  ${c.id} — ${c.nameI18N} (${c.descriptionI18N})`);
          }
          console.log("\nColors (max " + (attrs.settings?.maxColours || 2) + "):");
          for (const c of attrs.colour || []) {
            console.log(`  ${c.id} — ${c.nameI18N}`);
          }
        }
        break;
      }

      case "shipping": {
        const accessToken = await getAccessToken(rawArgs, json);
        const providers = await api.getShippingProviders(accessToken);
        if (json) {
          console.log(JSON.stringify({ providers }));
        } else {
          for (const provider of providers) {
            console.log(`${provider.id}:`);
            for (const size of provider.parcelSizes || []) {
              console.log(`  ${size.id} — ${size.title} (${size.subtitle}) $${size.cost?.amount}`);
            }
          }
        }
        break;
      }

      case "upload": {
        const imagePath = args[1];
        if (!imagePath) {
          usage(["Usage: depop upload <image-path>", "", "Image must be square. Depop will reject non-square images."], json);
        }
        const accessToken = await getAccessToken(rawArgs, json);
        const result = await api.uploadImage(imagePath, accessToken);
        if (json) {
          console.log(JSON.stringify({ id: result.id, url: result.url || result.imageUrl }));
        } else {
          console.log("Uploaded:");
          console.log("  ID:", result.id);
          console.log("  URL:", result.url || result.imageUrl || JSON.stringify(result));
        }
        break;
      }

      case "create": {
        const jsonFile = args[1];
        if (!jsonFile) {
          usage(["Usage: depop create <json-file>", "", "See examples/draft.json for the payload format."], json);
        }
        const accessToken = await getAccessToken(rawArgs, json);
        const draftData = JSON.parse(await readFile(jsonFile, "utf-8"));
        if (!json) console.log("Creating draft...");
        const draft = await api.createDraft(draftData, accessToken);
        if (json) {
          console.log(JSON.stringify({ draft: { id: draft.id } }));
        } else {
          console.log("Draft created:", draft.id);
          console.log("\nTo publish, open the draft in your browser:");
          console.log(`  ${DEPOP_BASE}/sellinghub/drafts/edit/${draft.id}/`);
          console.log("\nOr update it via: depop draft-update <draft-id> <json-file>");
        }
        break;
      }

      case "drafts": {
        const accessToken = await getAccessToken(rawArgs, json);
        const result = await api.getDrafts(accessToken);
        const items = result.drafts || [];
        if (json) {
          console.log(JSON.stringify({ drafts: items, total: items.length }));
        } else if (!items.length) {
          console.log("No drafts found.");
        } else {
          for (const item of items) {
            const desc = (item.description || "(no description)").split("\n")[0].slice(0, 60);
            const price = item.priceAmount ? `$${item.priceAmount}` : "?";
            const missing = item.missingFields?.length ? ` [missing: ${item.missingFields.join(", ")}]` : " [ready]";
            console.log(`[${item.id}] ${desc} — ${price}${missing}`);
          }
          console.log(`\nTotal: ${items.length} drafts`);
        }
        break;
      }

      case "draft-update": {
        const draftId = args[1];
        const jsonFile = args[2];
        if (!draftId || !jsonFile) usage(["Usage: depop draft-update <draft-id> <json-file>"], json);
        const accessToken = await getAccessToken(rawArgs, json);
        const draftData = JSON.parse(await readFile(jsonFile, "utf-8"));
        await api.updateDraft(draftId, draftData, accessToken);
        if (json) {
          console.log(JSON.stringify({ updated: draftId }));
        } else {
          console.log("Draft updated:", draftId);
          console.log(`  ${DEPOP_BASE}/sellinghub/drafts/edit/${draftId}/`);
        }
        break;
      }

      case "draft-delete": {
        const draftId = args[1];
        if (!draftId) usage(["Usage: depop draft-delete <draft-id>"], json);
        const accessToken = await getAccessToken(rawArgs, json);
        await api.deleteDraft(draftId, accessToken);
        if (json) {
          console.log(JSON.stringify({ deleted: draftId }));
        } else {
          console.log("Draft deleted:", draftId);
        }
        break;
      }

      case "edit": {
        const productId = args[1];
        const jsonFile = args[2];
        if (!productId || !jsonFile) usage(["Usage: depop edit <product-id> <json-file>"], json);
        const accessToken = await getAccessToken(rawArgs, json);
        const editData = JSON.parse(await readFile(jsonFile, "utf-8"));
        const result = await api.editProduct(productId, editData, accessToken);
        const url = `${DEPOP_BASE}/products/${result.slug || result.id}/`;
        if (json) {
          console.log(JSON.stringify({ listing: { id: result.id, url } }));
        } else {
          console.log("Updated listing:");
          console.log("  ID:", result.id);
          console.log("  URL:", url);
        }
        break;
      }

      case "delete": {
        const productId = args[1];
        if (!productId) usage(["Usage: depop delete <product-id>"], json);
        const accessToken = await getAccessToken(rawArgs, json);
        await api.deleteProduct(productId, accessToken);
        if (json) {
          console.log(JSON.stringify({ deleted: productId }));
        } else {
          console.log(`Deleted product ${productId}`);
        }
        break;
      }

      default:
        usage([`Unknown command: ${command}`, 'Run "depop --help" for usage.'], json);
    }
  } catch (e) {
    printError(e, json);
  }
}

main();
