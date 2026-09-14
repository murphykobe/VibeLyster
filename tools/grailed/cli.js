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
 *   grailed inbox                         List conversations (read-only)
 *   grailed conversation <id>             Get one conversation's full thread (read-only)
 *   grailed upload <image-path>           Upload an image, returns URL
 *   grailed create <json-file>            Create a draft listing
 *   grailed publish <draft-id> [json-file] Publish draft (update + submit)
 *   grailed publish <json-file>            Publish directly (no draft)
 *   grailed edit <listing-id> <json-file>  Edit a live listing in-place
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
 *
 * --json: every command accepts --json to emit exactly one JSON document
 * on stdout instead of the human-readable text above, and nothing else on
 * stdout. Without --json, output is unchanged from before this flag
 * existed — this is an additive flag, not a behavior change.
 *
 * Exit codes (apply regardless of --json):
 *   0  success
 *   1  an ordinary error (bad usage, an application-level API error)
 *   3  SESSION_EXPIRED — the cookie/CSRF pair is invalid or expired
 *   4  CLOUDFLARE_BLOCK — Cloudflare's edge answered, not Grailed's backend
 * 3 and 4 exist so an unattended caller (a daily cron) can tell "nothing
 * new" apart from "the session is dead" or "we got edge-blocked" — see
 * classifyError() in grailed-api.js, which is the single source of truth
 * for this classification.
 */

import * as api from "./grailed-api.js";
import { classifyError } from "./grailed-api.js";
import { readFile } from "node:fs/promises";

const GRAILED_BASE = "https://www.grailed.com";

function getAuth(args, json) {
  const csrfToken =
    getFlagValue(args, "--csrf-token") || process.env.GRAILED_CSRF_TOKEN;
  const cookies =
    getFlagValue(args, "--cookies") || process.env.GRAILED_COOKIES;

  if (!csrfToken || !cookies) {
    fail(
      "Authentication required.\n\n" +
        "Set GRAILED_CSRF_TOKEN and GRAILED_COOKIES environment variables,\n" +
        "or pass --csrf-token <token> --cookies <cookies> flags.\n\n" +
        "To get these values:\n" +
        "  1. Log into grailed.com in your browser\n" +
        "  2. Open DevTools > Application > Cookies\n" +
        "  3. Copy csrf_token value and all cookies string",
      json
    );
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

/** Usage/validation error: always exit 1, prefixed the same as before when
 * not --json (`"Usage: ..."` messages keep their original console.error
 * call sites; this is for the free-form ones like getAuth's). */
function fail(message, json) {
  if (json) {
    console.log(JSON.stringify({ error: message }));
  } else {
    console.error("Error:", message);
  }
  process.exit(1);
}

/** Prints a usage line exactly as before, optionally also as JSON, exit 1. */
function usage(lines, json) {
  if (json) {
    console.log(JSON.stringify({ error: lines[0] }));
  } else {
    for (const line of lines) console.error(line);
  }
  process.exit(1);
}

/** Central error output for anything thrown by grailed-api.js. Exit code
 * follows classifyError() regardless of --json. */
function printError(e, json) {
  const c = classifyError(e);
  if (json) {
    const doc =
      c.key === "SESSION_EXPIRED" || c.key === "CLOUDFLARE_BLOCK"
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
  const valueFlags = ["--csrf-token", "--cookies", "--page", "--context"];
  const boolFlags = ["--draft", "--json"];
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
    console.log(`Grailed CLI — VibeLyster Proof of Concept

Commands:
  auth                          Check login status
  categories                    List all categories
  brand <query> [department]    Search for a brand (public, no auth needed)
  listing <id>                  Get listing details (public)
  wardrobe                      List your active listings
  drafts                        List your drafts
  addresses                     List your shipping addresses
  inbox                         List conversations (read-only)
  conversation <id>             Get one conversation's full thread (read-only)
  upload <image-path>           Upload an image, get back URL
  create <json-file>            Create a draft listing
  publish <draft-id> [json-file] Publish a draft (update + submit). Omit json to submit as-is
  publish <json-file>            Publish directly via POST /api/listings (no draft)
  edit <listing-id> <json-file> Edit a live listing (price, description, photos, etc.)
  delete <listing-id>           Delete a listing or draft

Every command accepts --json for machine-readable output.

Auth:
  Set GRAILED_CSRF_TOKEN and GRAILED_COOKIES env vars
  Or pass --csrf-token <token> --cookies <cookies>
`);
    return;
  }

  try {
    switch (command) {
      case "auth": {
        const { csrfToken, cookies } = getAuth(rawArgs, json);
        const result = await api.checkLogin(csrfToken, cookies);
        if (result.loggedIn) {
          if (json) {
            console.log(JSON.stringify({ loggedIn: true, user: result.user }));
          } else {
            console.log("Logged in as:", result.user.username);
            console.log("User ID:", result.user.id);
            console.log("Email:", result.user.email || "(not available)");
          }
        } else {
          if (json) {
            const doc =
              result.key === "SESSION_EXPIRED" || result.key === "CLOUDFLARE_BLOCK"
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

      case "categories": {
        const cats = await api.getCategories();
        const data = cats.data.categories;
        if (json) {
          console.log(JSON.stringify({ categories: data }));
        } else {
          for (const [, cat] of Object.entries(data)) {
            console.log(`\n${cat.department}/${cat.name} (${cat.path})`);
            if (cat.subcategories) {
              for (const sub of cat.subcategories) {
                console.log(`  - ${sub.name} (${sub.path})`);
              }
            }
          }
        }
        break;
      }

      case "brand": {
        const query = args[1];
        if (!query) usage(["Usage: grailed brand <query> [department]"], json);
        const dept = args[2] || "menswear";
        const brands = await api.searchBrand(query, dept);
        if (json) {
          console.log(JSON.stringify({ brands: brands || [] }));
        } else if (!brands) {
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
        if (!id) usage(["Usage: grailed listing <id>"], json);
        const listing = await api.getListing(id);
        if (json) {
          console.log(JSON.stringify({ listing: listing.data }));
        } else {
          console.log(JSON.stringify(listing.data, null, 2));
        }
        break;
      }

      case "wardrobe": {
        const { csrfToken, cookies } = getAuth(rawArgs, json);
        const me = await api.getMe(csrfToken, cookies);
        const userId = me.data.id;
        if (!json) console.log(`Wardrobe for ${me.data.username} (ID: ${userId}):\n`);

        const items = [];
        let page = 1;
        while (true) {
          const result = await api.getWardrobe(userId, page, 20, cookies);
          for (const item of result.data) {
            items.push(item);
            if (!json) {
              console.log(`[${item.id}] ${item.title} — $${item.price}`);
              console.log(`  ${GRAILED_BASE}${item.pretty_path || `/listings/${item.id}`}`);
            }
          }
          if (result.metadata?.is_last_page || result.data.length < 20) break;
          page++;
        }
        if (json) {
          console.log(
            JSON.stringify({
              user: { username: me.data.username, id: userId },
              listings: items,
              total: items.length,
            })
          );
        } else {
          console.log(`\nTotal: ${items.length} listings`);
        }
        break;
      }

      case "addresses": {
        const { csrfToken, cookies } = getAuth(rawArgs, json);
        const me = await api.getMe(csrfToken, cookies);
        const addrs = await api.getAddresses(me.data.id, csrfToken, cookies);
        if (json) {
          console.log(JSON.stringify({ addresses: addrs.data }));
        } else {
          console.log(JSON.stringify(addrs.data, null, 2));
        }
        break;
      }

      case "inbox": {
        const { csrfToken, cookies } = getAuth(rawArgs, json);
        const page = getFlagValue(rawArgs, "--page") || undefined;
        const context = getFlagValue(rawArgs, "--context") || undefined;
        const result = await api.getConversations(csrfToken, cookies, { page, context });
        const conversations = result.data;
        if (json) {
          console.log(JSON.stringify({ conversations }));
        } else {
          for (const c of conversations) {
            const last = c.activity_log?.[c.activity_log.length - 1];
            const preview = last?.message ? last.message.slice(0, 60) : `(${last?.type ?? "no activity"})`;
            console.log(
              `[${c.id}] ${c.state} ${c.is_read ? " " : "*"} ${c.interlocutor?.username} — "${c.listing?.title}" — ${preview}`
            );
          }
          console.log(`\nTotal: ${conversations.length} conversations`);
        }
        break;
      }

      case "conversation": {
        const id = args[1];
        if (!id) usage(["Usage: grailed conversation <id>"], json);
        const { csrfToken, cookies } = getAuth(rawArgs, json);
        const result = await api.getConversation(id, csrfToken, cookies);
        if (json) {
          console.log(JSON.stringify({ conversation: result.data }));
        } else {
          console.log(JSON.stringify(result.data, null, 2));
        }
        break;
      }

      case "upload": {
        const imagePath = args[1];
        if (!imagePath) usage(["Usage: grailed upload <image-path>"], json);
        const { csrfToken, cookies } = getAuth(rawArgs, json);
        const imageUrl = await api.uploadImage(imagePath, csrfToken, cookies);
        if (json) {
          console.log(JSON.stringify({ url: imageUrl }));
        } else {
          console.log("Uploaded:", imageUrl);
        }
        break;
      }

      case "drafts": {
        const { csrfToken, cookies } = getAuth(rawArgs, json);
        const items = [];
        let page = 1;
        while (true) {
          const result = await api.getDrafts(page, csrfToken, cookies);
          for (const item of result.data) {
            items.push(item);
            if (!json) {
              const pct = item.percentage_complete || 0;
              const name = item.draft_name || item.title || "(untitled)";
              console.log(`[${item.id}] ${name} — $${item.price || "?"} (${pct}% complete)`);
            }
          }
          if (result.metadata?.is_last_page || result.data.length < 20) break;
          page++;
        }
        if (json) {
          console.log(JSON.stringify({ drafts: items, total: items.length }));
        } else {
          console.log(`\nTotal: ${items.length} drafts`);
        }
        break;
      }

      case "create": {
        const jsonFile = args[1];
        if (!jsonFile) {
          usage(
            [
              "Usage: grailed create <json-file>",
              "",
              "Creates a draft listing. Use 'grailed publish' to make it live.",
            ],
            json
          );
        }
        const { csrfToken, cookies } = getAuth(rawArgs, json);
        const draftData = JSON.parse(await readFile(jsonFile, "utf-8"));
        const result = await api.createDraft(draftData, csrfToken, cookies);
        if (json) {
          console.log(
            JSON.stringify({
              draft: {
                id: result.data.id,
                title: result.data.title,
                percentage_complete: result.data.percentage_complete,
              },
            })
          );
        } else {
          console.log("Created draft:");
          console.log("  ID:", result.data.id);
          console.log("  Title:", result.data.title);
          console.log("  Complete:", `${result.data.percentage_complete}%`);
          console.log(`  View: ${GRAILED_BASE}/sell/drafts`);
        }
        break;
      }

      case "publish": {
        const draftIdOrFile = args[1];
        if (!draftIdOrFile) {
          usage(
            [
              "Usage: grailed publish <draft-id> [json-file]",
              "       grailed publish <json-file>        (direct publish, no draft)",
              "",
              "Publish a draft (2-step: update draft → submit), or publish directly.",
              "See examples/publish.json for the format.",
            ],
            json
          );
        }
        const { csrfToken, cookies } = getAuth(rawArgs, json);

        let result;
        // If first arg is a number, it's a draft ID (2-step flow)
        if (/^\d+$/.test(draftIdOrFile)) {
          const draftId = draftIdOrFile;
          const jsonFile = args[2];
          if (jsonFile) {
            const publishData = JSON.parse(await readFile(jsonFile, "utf-8"));
            if (!json) console.log(`Updating draft ${draftId}...`);
            await api.updateDraft(draftId, publishData, csrfToken, cookies);
          }
          if (!json) console.log(`Submitting draft ${draftId}...`);
          result = await api.submitDraft(draftId, csrfToken, cookies);
        } else {
          // First arg is a JSON file — direct publish via POST /api/listings
          const publishData = JSON.parse(await readFile(draftIdOrFile, "utf-8"));
          result = await api.publishListing(publishData, csrfToken, cookies);
        }

        const url = `${GRAILED_BASE}${result.data.pretty_path || `/listings/${result.data.id}`}`;
        if (json) {
          console.log(JSON.stringify({ listing: { id: result.data.id, url } }));
        } else {
          console.log("Published listing:");
          console.log("  ID:", result.data.id);
          console.log("  URL:", url);
        }
        break;
      }

      case "edit": {
        const listingId = args[1];
        const jsonFile = args[2];
        if (!listingId || !jsonFile) {
          usage(
            [
              "Usage: grailed edit <listing-id> <json-file>",
              "",
              "Edit a live listing in-place. Uses publish-format JSON (price as string, makeoffer/buynow).",
            ],
            json
          );
        }
        const { csrfToken, cookies } = getAuth(rawArgs, json);
        const editData = JSON.parse(await readFile(jsonFile, "utf-8"));
        const editResult = await api.editListing(listingId, editData, csrfToken, cookies);
        const url = `${GRAILED_BASE}${editResult.data.pretty_path || `/listings/${editResult.data.id}`}`;
        if (json) {
          console.log(
            JSON.stringify({
              listing: { id: editResult.data.id, title: editResult.data.title, price: editResult.data.price, url },
            })
          );
        } else {
          console.log("Updated listing:");
          console.log("  ID:", editResult.data.id);
          console.log("  Title:", editResult.data.title);
          console.log("  Price:", `$${editResult.data.price}`);
          console.log("  URL:", url);
        }
        break;
      }

      case "delete": {
        const listingId = args[1];
        if (!listingId) usage(["Usage: grailed delete <listing-or-draft-id>"], json);
        const { csrfToken, cookies } = getAuth(rawArgs, json);
        // Try deleting as listing first, fall back to draft
        let type;
        try {
          await api.deleteListing(listingId, csrfToken, cookies);
          type = "listing";
        } catch {
          await api.deleteDraft(listingId, csrfToken, cookies);
          type = "draft";
        }
        if (json) {
          console.log(JSON.stringify({ deleted: listingId, type }));
        } else {
          console.log(`Deleted ${type} ${listingId}`);
        }
        break;
      }

      default:
        usage([`Unknown command: ${command}`, 'Run "grailed --help" for usage.'], json);
    }
  } catch (e) {
    printError(e, json);
  }
}

main();
