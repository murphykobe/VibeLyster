#!/usr/bin/env node

/**
 * Grailed CLI — Proof of concept for VibeLyster
 *
 * Usage:
 *   grailed auth                          Check login status
 *   grailed categories                    List all categories
 *   grailed brand <query> [department]    Search for a brand (public, no auth)
 *   grailed listing <id>                  Get listing details (public)
 *   grailed wardrobe                      List your active listings
 *   grailed drafts                        List your drafts
 *   grailed addresses                     List your shipping addresses
 *   grailed upload <image-path>           Upload an image, returns URL
 *   grailed create <json-file>            Create a draft listing
 *   grailed publish <draft-id> [json-file] Publish draft (update + submit)
 *   grailed publish <json-file>            Publish directly (no draft)
 *   grailed delete <listing-id>           Delete a listing
 *
 * Auth: Set GRAILED_CSRF_TOKEN and GRAILED_COOKIES env vars,
 *       or pass --csrf-token and --cookies flags.
 *
 * To get your tokens:
 *   1. Log into grailed.com in your browser
 *   2. Open DevTools > Application > Cookies
 *   3. Copy the csrf_token cookie value
 *   4. Copy all cookies as a string (or use the browser tool in OpenClaw)
 */

import * as api from "./grailed-api.js";
import { readFile } from "node:fs/promises";

const GRAILED_BASE = "https://www.grailed.com";

function getAuth(args) {
  const csrfToken =
    getFlagValue(args, "--csrf-token") || process.env.GRAILED_CSRF_TOKEN;
  const cookies =
    getFlagValue(args, "--cookies") || process.env.GRAILED_COOKIES;

  if (!csrfToken || !cookies) {
    console.error(
      "Error: Authentication required.\n\n" +
        "Set GRAILED_CSRF_TOKEN and GRAILED_COOKIES environment variables,\n" +
        "or pass --csrf-token <token> --cookies <cookies> flags.\n\n" +
        "To get these values:\n" +
        "  1. Log into grailed.com in your browser\n" +
        "  2. Open DevTools > Application > Cookies\n" +
        "  3. Copy csrf_token value and all cookies string"
    );
    process.exit(1);
  }
  return { csrfToken, cookies };
}

function getFlagValue(args, flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

function cleanArgs(args) {
  const cleaned = [];
  const valueFlags = ["--csrf-token", "--cookies"];
  const boolFlags = ["--draft"];
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
  const args = cleanArgs(rawArgs);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    console.log(`Grailed CLI — VibeLyster Proof of Concept

Commands:
  auth                          Check login status
  categories                    List all categories
  brand <query> [department]    Search for a brand (public, no auth needed)
  listing <id>                  Get listing details (public)
  wardrobe                      List your active listings
  drafts                        List your drafts
  addresses                     List your shipping addresses
  upload <image-path>           Upload an image, get back URL
  create <json-file>            Create a draft listing
  publish <draft-id> [json-file] Publish a draft (update + submit). Omit json to submit as-is
  publish <json-file>            Publish directly via POST /api/listings (no draft)
  delete <listing-id>           Delete a listing or draft

Auth:
  Set GRAILED_CSRF_TOKEN and GRAILED_COOKIES env vars
  Or pass --csrf-token <token> --cookies <cookies>
`);
    return;
  }

  try {
    switch (command) {
      case "auth": {
        const { csrfToken, cookies } = getAuth(rawArgs);
        const result = await api.checkLogin(csrfToken, cookies);
        if (result.loggedIn) {
          console.log("Logged in as:", result.user.username);
          console.log("User ID:", result.user.id);
          console.log("Email:", result.user.email || "(not available)");
        } else {
          console.error("Not logged in:", result.error);
          process.exit(1);
        }
        break;
      }

      case "categories": {
        const cats = await api.getCategories();
        const data = cats.data.categories;
        for (const [key, cat] of Object.entries(data)) {
          console.log(`\n${cat.department}/${cat.name} (${cat.path})`);
          if (cat.subcategories) {
            for (const sub of cat.subcategories) {
              console.log(`  - ${sub.name} (${sub.path})`);
            }
          }
        }
        break;
      }

      case "brand": {
        const query = args[1];
        if (!query) {
          console.error("Usage: grailed brand <query> [department]");
          process.exit(1);
        }
        const dept = args[2] || "menswear";
        const brands = await api.searchBrand(query, dept);
        if (!brands) {
          console.log("No brands found for:", query);
        } else {
          for (const b of brands) {
            console.log(`${b.name} (id: ${b.id}, slug: ${b.slug})`);
            console.log(`  departments: ${b.departments.join(", ")}`);
          }
        }
        break;
      }

      case "listing": {
        const id = args[1];
        if (!id) {
          console.error("Usage: grailed listing <id>");
          process.exit(1);
        }
        const listing = await api.getListing(id);
        console.log(JSON.stringify(listing.data, null, 2));
        break;
      }

      case "wardrobe": {
        const { csrfToken, cookies } = getAuth(rawArgs);
        const me = await api.getMe(csrfToken, cookies);
        const userId = me.data.id;
        console.log(`Wardrobe for ${me.data.username} (ID: ${userId}):\n`);

        let page = 1;
        let total = 0;
        while (true) {
          const result = await api.getWardrobe(userId, page, 20, cookies);
          for (const item of result.data) {
            total++;
            console.log(
              `[${item.id}] ${item.title} — $${item.price}`
            );
            console.log(
              `  ${GRAILED_BASE}${item.pretty_path || `/listings/${item.id}`}`
            );
          }
          if (result.metadata?.is_last_page || result.data.length < 20) break;
          page++;
        }
        console.log(`\nTotal: ${total} listings`);
        break;
      }

      case "addresses": {
        const { csrfToken, cookies } = getAuth(rawArgs);
        const me = await api.getMe(csrfToken, cookies);
        const addrs = await api.getAddresses(me.data.id, csrfToken, cookies);
        console.log(JSON.stringify(addrs.data, null, 2));
        break;
      }

      case "upload": {
        const imagePath = args[1];
        if (!imagePath) {
          console.error("Usage: grailed upload <image-path>");
          process.exit(1);
        }
        const { csrfToken, cookies } = getAuth(rawArgs);
        const imageUrl = await api.uploadImage(imagePath, csrfToken, cookies);
        console.log("Uploaded:", imageUrl);
        break;
      }

      case "drafts": {
        const { csrfToken, cookies } = getAuth(rawArgs);
        let page = 1;
        let total = 0;
        while (true) {
          const result = await api.getDrafts(page, csrfToken, cookies);
          for (const item of result.data) {
            total++;
            const pct = item.percentage_complete || 0;
            const name = item.draft_name || item.title || "(untitled)";
            console.log(
              `[${item.id}] ${name} — $${item.price || "?"} (${pct}% complete)`
            );
          }
          if (result.metadata?.is_last_page || result.data.length < 20) break;
          page++;
        }
        console.log(`\nTotal: ${total} drafts`);
        break;
      }

      case "create": {
        const jsonFile = args[1];
        if (!jsonFile) {
          console.error("Usage: grailed create <json-file>");
          console.error(
            "\nCreates a draft listing. Use 'grailed publish' to make it live."
          );
          process.exit(1);
        }
        const { csrfToken, cookies } = getAuth(rawArgs);
        const draftData = JSON.parse(await readFile(jsonFile, "utf-8"));
        const result = await api.createDraft(draftData, csrfToken, cookies);
        console.log("Created draft:");
        console.log("  ID:", result.data.id);
        console.log("  Title:", result.data.title);
        console.log("  Complete:", `${result.data.percentage_complete}%`);
        console.log(`  View: ${GRAILED_BASE}/sell/drafts`);
        break;
      }

      case "publish": {
        const draftIdOrFile = args[1];
        if (!draftIdOrFile) {
          console.error("Usage: grailed publish <draft-id> [json-file]");
          console.error("       grailed publish <json-file>        (direct publish, no draft)");
          console.error(
            "\nPublish a draft (2-step: update draft → submit), or publish directly."
          );
          console.error("See examples/publish.json for the format.");
          process.exit(1);
        }
        const { csrfToken, cookies } = getAuth(rawArgs);

        // If first arg is a number, it's a draft ID (2-step flow)
        if (/^\d+$/.test(draftIdOrFile)) {
          const draftId = draftIdOrFile;
          const jsonFile = args[2];
          if (jsonFile) {
            const publishData = JSON.parse(await readFile(jsonFile, "utf-8"));
            console.log(`Updating draft ${draftId}...`);
            await api.updateDraft(draftId, publishData, csrfToken, cookies);
          }
          console.log(`Submitting draft ${draftId}...`);
          const result = await api.submitDraft(draftId, csrfToken, cookies);
          console.log("Published listing:");
          console.log("  ID:", result.data.id);
          console.log(
            "  URL:",
            `${GRAILED_BASE}${result.data.pretty_path || `/listings/${result.data.id}`}`
          );
        } else {
          // First arg is a JSON file — direct publish via POST /api/listings
          const publishData = JSON.parse(await readFile(draftIdOrFile, "utf-8"));
          const result = await api.publishListing(
            publishData,
            csrfToken,
            cookies
          );
          console.log("Published listing:");
          console.log("  ID:", result.data.id);
          console.log(
            "  URL:",
            `${GRAILED_BASE}${result.data.pretty_path || `/listings/${result.data.id}`}`
          );
        }
        break;
      }

      case "delete": {
        const listingId = args[1];
        if (!listingId) {
          console.error("Usage: grailed delete <listing-or-draft-id>");
          process.exit(1);
        }
        const { csrfToken, cookies } = getAuth(rawArgs);
        // Try deleting as listing first, fall back to draft
        try {
          await api.deleteListing(listingId, csrfToken, cookies);
          console.log(`Deleted listing ${listingId}`);
        } catch {
          await api.deleteDraft(listingId, csrfToken, cookies);
          console.log(`Deleted draft ${listingId}`);
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        console.error('Run "grailed --help" for usage.');
        process.exit(1);
    }
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  }
}

main();
