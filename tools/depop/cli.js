#!/usr/bin/env node

/**
 * Depop CLI — VibeLyster
 *
 * Usage:
 *   depop login                          Log in via magic link (recommended)
 *   depop auth                           Check login status
 *   depop logout                         Remove saved credentials
 *   depop listings [--status <filter>]   List your products (default: selling)
 *   depop listing <id>                   Get product details
 *   depop addresses                      List shipping addresses
 *   depop upload <image-path>            Upload a square image, returns {id, url}
 *   depop create <json-file>             Create a product listing
 *   depop edit <product-id> <json-file>  Edit a live product in-place
 *   depop delete <product-id>            Delete a product
 *
 * Auth: Run `depop login` to authenticate via Depop's magic link email.
 *       Tokens are saved to ~/.vibelyster/depop.json.
 *       Alternatively, set DEPOP_ACCESS_TOKEN and DEPOP_USER_ID env vars.
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
    if (data.accessToken && data.userId) return data;
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

function getAuth(args) {
  // Will be called after tryGetAuth resolves
  throw new Error("Use tryGetAuth instead");
}

async function tryGetAuth(args) {
  // Priority: flags > env vars > saved file
  const accessToken =
    getFlagValue(args, "--access-token") ||
    process.env.DEPOP_ACCESS_TOKEN;
  const userId =
    getFlagValue(args, "--user-id") ||
    process.env.DEPOP_USER_ID;
  const cookies =
    getFlagValue(args, "--cookies") ||
    process.env.DEPOP_COOKIES ||
    "";

  if (accessToken && userId) {
    return { accessToken, userId, cookies };
  }

  // Try saved auth
  const saved = await loadSavedAuth();
  if (saved) {
    return {
      accessToken: saved.accessToken,
      userId: saved.userId,
      cookies: saved.cookies || "",
    };
  }

  console.error(
    'Error: Not logged in. Run "depop login" to authenticate via magic link.\n\n' +
      "Or set DEPOP_ACCESS_TOKEN and DEPOP_USER_ID env vars."
  );
  process.exit(1);
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
  login                           Log in via Depop magic link email
  auth                            Check login status
  logout                          Remove saved credentials
  listings [--status <filter>]    List your products (selling, sold, all)
  listing <id>                    Get product details
  addresses                       List shipping addresses
  upload <image-path>             Upload a square image, returns {id, url}
  create <json-file>              Create a product listing
  edit <product-id> <json-file>   Edit a live product in-place
  delete <product-id>             Delete a product

Auth:
  Run "depop login" to authenticate (recommended).
  Tokens are saved to ~/.vibelyster/depop.json.
  Or set DEPOP_ACCESS_TOKEN and DEPOP_USER_ID env vars.

Note: Images must be square. Crop before uploading.
`);
    return;
  }

  try {
    switch (command) {
      case "login": {
        console.log("Depop Magic Link Login\n");

        const email = await prompt("Enter your Depop email: ");
        if (!email) {
          console.error("Email is required.");
          process.exit(1);
        }

        console.log(`\nRequesting magic link for ${email}...`);
        try {
          await api.requestMagicLink(email);
        } catch (e) {
          // If the endpoint doesn't work, fall back to manual instructions
          console.log(
            "\nCould not request magic link automatically.",
            "\nPlease request it manually:"
          );
          console.log("  1. Go to https://www.depop.com/login/");
          console.log(`  2. Enter ${email} and click "Send magic link"`);
        }

        console.log("\nCheck your email for the magic link from Depop.");
        console.log(
          'IMPORTANT: Do NOT click the link. Instead, copy the URL from the "Log in to Depop" button.'
        );
        console.log(
          "  (Right-click or long-press the button → Copy Link)\n"
        );

        const magicLink = await prompt("Paste the magic link URL here: ");
        if (!magicLink) {
          console.error("Magic link URL is required.");
          process.exit(1);
        }

        console.log("\nRedeeming magic link...");
        const authData = await api.redeemMagicLink(magicLink);

        // Verify the token works
        const check = await api.checkLogin(
          authData.accessToken,
          authData.userId,
          authData.cookies
        );

        if (!check.loggedIn) {
          console.error("Login failed — token did not work:", check.error);
          process.exit(1);
        }

        // Save to config file
        await saveAuth({
          accessToken: authData.accessToken,
          userId: authData.userId,
          cookies: authData.cookies,
          email,
          savedAt: new Date().toISOString(),
        });

        const u = check.user;
        console.log(`\nLogged in as: ${u.username || u.name || "(unknown)"}`);
        console.log(`User ID: ${authData.userId}`);
        console.log(`Credentials saved to ${CONFIG_FILE}`);
        break;
      }

      case "auth": {
        const { accessToken, userId, cookies } = await tryGetAuth(rawArgs);
        const result = await api.checkLogin(accessToken, userId, cookies);
        if (result.loggedIn) {
          const u = result.user;
          console.log("Logged in as:", u.username || u.name || "(unknown)");
          console.log("User ID:", userId);
          if (u.email) console.log("Email:", u.email);

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
        const { accessToken, userId, cookies } = await tryGetAuth(rawArgs);
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
        const { accessToken, userId, cookies } = await tryGetAuth(rawArgs);
        const result = await api.getProduct(productId, accessToken, userId, cookies);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case "addresses": {
        const { accessToken, userId, cookies } = await tryGetAuth(rawArgs);
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
        const { accessToken, userId, cookies } = await tryGetAuth(rawArgs);
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
        const { accessToken, userId, cookies } = await tryGetAuth(rawArgs);
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
        const { accessToken, userId, cookies } = await tryGetAuth(rawArgs);
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
        const { accessToken, userId, cookies } = await tryGetAuth(rawArgs);
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
