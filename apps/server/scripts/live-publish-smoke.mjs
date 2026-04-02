#!/usr/bin/env node

const API_URL = process.env.API_URL ?? "http://127.0.0.1:3001";
const SHOW_HELP = process.argv.includes("--help") || process.argv.includes("-h");
const AUTH_TOKEN = normalizeAuthToken(process.env.AUTH_TOKEN);
const LISTING_ID = process.env.LISTING_ID;
const LISTING_JSON = process.env.LISTING_JSON;
const LISTING_FILE = process.env.LISTING_FILE;
const PHOTO_URL = process.env.PHOTO_URL;
const PHOTO_FILE = process.env.PHOTO_FILE;
const PLATFORM = process.env.PLATFORM;
const CSRF_TOKEN = process.env.CSRF_TOKEN;
const TOKENS_JSON = process.env.TOKENS_JSON;
const TOKENS_FILE = process.env.TOKENS_FILE;
const PLATFORM_USERNAME = process.env.PLATFORM_USERNAME;
const EXPIRES_AT = process.env.EXPIRES_AT;
const DEV_USER_ID = process.env.DEV_USER_ID;
const DEV_USER_EMAIL = process.env.DEV_USER_EMAIL;
const SKIP_CONNECT = truthy(process.env.SKIP_CONNECT);
const CHECK_STATUS = !falsy(process.env.CHECK_STATUS);
const CLEANUP = truthy(process.env.CLEANUP ?? "");

function truthy(value) {
  return ["1", "true", "yes", "on"].includes((value ?? "").toLowerCase());
}

function falsy(value) {
  return ["0", "false", "no", "off"].includes((value ?? "").toLowerCase());
}

function normalizeAuthToken(value) {
  if (!value) return value;
  return value.startsWith("Bearer ") ? value.slice(7) : value;
}

function usage(message, exitCode = 1) {
  if (message) {
    console.error(`\nError: ${message}\n`);
  }

  console.error(`Usage:
  AUTH_TOKEN=... \\
  PLATFORM=grailed|depop \\
  TOKENS_JSON='{"csrf_token":"...","cookies":"..."}' \\
  npm run publish:smoke

Options:
  API_URL=http://127.0.0.1:3001
  LISTING_ID=<existing listing uuid>
  LISTING_JSON='{"title":"...","description":"...","price":120,"photos":["https://..."]}'
  LISTING_FILE=/absolute/path/to/listing.json
  PHOTO_URL=https://public-image.example/photo.jpg
  PHOTO_FILE=/absolute/path/to/photo.jpg
  CSRF_TOKEN=<grailed csrf token override>
  TOKENS_FILE=/absolute/path/to/tokens.json
  DEV_USER_ID=<local auth bypass user id>
  DEV_USER_EMAIL=<optional local bypass email>
  PLATFORM_USERNAME=<optional display name>
  EXPIRES_AT=<optional ISO timestamp>
  SKIP_CONNECT=1
  CHECK_STATUS=0
  CLEANUP=1

Examples:
  AUTH_TOKEN=clerk_jwt PLATFORM=grailed \\
  TOKENS_JSON='{"csrf_token":"abc","cookies":"grailed_jwt=...; csrftoken=..."}' \\
  npm run publish:smoke

  AUTH_TOKEN=clerk_jwt LISTING_ID=uuid PLATFORM=depop \\
  TOKENS_FILE=$PWD/depop-tokens.json \\
  npm run publish:smoke

  AUTH_TOKEN=clerk_jwt PLATFORM=grailed PHOTO_URL=https://placehold.co/1200x1200.jpg CLEANUP=1 \\
  TOKENS_JSON='{"csrf_token":"abc","cookies":"grailed_jwt=...; csrftoken=..."}' \\
  npm run publish:smoke
`);
  process.exit(exitCode);
}

async function readTokens() {
  if (!TOKENS_JSON && !TOKENS_FILE) {
    usage("Provide TOKENS_JSON or TOKENS_FILE.");
  }

  const raw = TOKENS_JSON ?? await import("node:fs/promises").then((fs) => fs.readFile(TOKENS_FILE, "utf8"));

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      usage("Token payload must be a JSON object.");
    }
    return parsed;
  } catch (error) {
    if (PLATFORM === "grailed") {
      const cookies = normalizeCookieHeader(raw);
      const csrfToken = CSRF_TOKEN || readCookie(cookies, "csrf_token") || readCookie(cookies, "csrftoken");
      if (!csrfToken) {
        usage("Grailed cookie string must include csrf_token.");
      }
      return { csrf_token: csrfToken, cookies };
    }
    usage(`Invalid token JSON. ${error instanceof Error ? error.message : String(error)}`);
  }
}

function requireEnv(name, value) {
  if (!value) usage(`Missing ${name}.`);
}

function makeAuthHeaders(body) {
  if (DEV_USER_ID) {
    return {
      "x-dev-user-id": DEV_USER_ID,
      ...(DEV_USER_EMAIL ? { "x-dev-user-email": DEV_USER_EMAIL } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    };
  }

  return {
    Authorization: `Bearer ${AUTH_TOKEN}`,
    ...(body ? { "Content-Type": "application/json" } : {}),
  };
}

async function request(method, path, body) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: makeAuthHeaders(body),
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? safeParseJson(text) : null;

  if (!res.ok) {
    const errorMessage =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `${res.status} ${res.statusText}`;
    throw new Error(`${method} ${path} failed: ${errorMessage}`);
  }

  return data;
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function readCookie(cookieHeader, name) {
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1];
}

function normalizeCookieHeader(raw) {
  return raw
    .replace(/^\s*TOKENS_JSON:\s*/i, "")
    .replace(/^\s*cookies:\s*/i, "")
    .replace(/\r?\n+/g, " ")
    .replace(/\s*;\s*/g, "; ")
    .trim();
}

function guessMimeType(filePath) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".heif")) return "image/heif";
  return "image/jpeg";
}

async function maybeUploadPhoto() {
  if (!PHOTO_FILE) return PHOTO_URL ?? "https://placehold.co/1200x1200.jpg";

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const fileBuffer = await fs.readFile(PHOTO_FILE);
  const fileName = path.basename(PHOTO_FILE);
  const contentType = guessMimeType(PHOTO_FILE);
  const form = new FormData();
  form.append("file", new File([fileBuffer], fileName, { type: contentType }));

  console.log("\n0. Uploading local photo...");
  const res = await fetch(`${API_URL}/api/upload`, {
    method: "POST",
    headers: DEV_USER_ID
      ? {
          "x-dev-user-id": DEV_USER_ID,
          ...(DEV_USER_EMAIL ? { "x-dev-user-email": DEV_USER_EMAIL } : {}),
        }
      : {
          Authorization: `Bearer ${AUTH_TOKEN}`,
        },
    body: form,
  });

  const text = await res.text();
  const data = text ? safeParseJson(text) : null;
  if (!res.ok) {
    const errorMessage =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : `${res.status} ${res.statusText}`;
    throw new Error(`POST /api/upload failed: ${errorMessage}`);
  }

  if (!data || typeof data !== "object" || typeof data.url !== "string") {
    throw new Error("POST /api/upload returned no photo URL");
  }

  console.log(`Uploaded photo: ${data.url}`);
  return data.url;
}

function defaultListing() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return {
    title: `Smoke Test ${stamp}`,
    description: "Smoke test listing created by live-publish-smoke.mjs",
    price: 120,
    size: "10",
    condition: "gently_used",
    brand: "Nike",
    category: "footwear.sneakers",
    traits: {
      color: "black",
      country_of_origin: "US",
    },
    photos: [],
  };
}

async function readListingPayload() {
  if (LISTING_ID) return null;

  const raw = LISTING_JSON
    ?? (LISTING_FILE
      ? await import("node:fs/promises").then((fs) => fs.readFile(LISTING_FILE, "utf8"))
      : null);

  if (!raw) return defaultListing();

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      usage("Listing payload must be a JSON object.");
    }
    return parsed;
  } catch (error) {
    usage(`Invalid listing JSON. ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function maybeCreateListing() {
  const payload = await readListingPayload();
  if (!payload) {
    return { listingId: LISTING_ID, created: false };
  }

  if (!Array.isArray(payload.photos) || payload.photos.length === 0) {
    payload.photos = [await maybeUploadPhoto()];
  }

  console.log("\n0. Creating draft listing...");
  const listing = await request("POST", "/api/listings", payload);
  console.log("Draft created:");
  console.log(JSON.stringify({ id: listing.id, title: listing.title, price: listing.price }, null, 2));
  return { listingId: listing.id, created: true };
}

async function cleanupListing(listingId, platform, publishOk) {
  console.log("\n4. Cleanup...");

  if (publishOk) {
    try {
      const delistResult = await request("POST", "/api/delist", { listingId, platform });
      console.log("Delist result:");
      console.log(JSON.stringify(delistResult, null, 2));
    } catch (error) {
      console.warn(`Delist cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  try {
    await request("DELETE", `/api/listings/${listingId}`);
    console.log(`Listing ${listingId} deleted.`);
  } catch (error) {
    console.warn(`Delete cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  if (SHOW_HELP) usage(undefined, 0);

  if (!DEV_USER_ID) {
    requireEnv("AUTH_TOKEN", AUTH_TOKEN);
  }
  requireEnv("PLATFORM", PLATFORM);

  if (!["grailed", "depop"].includes(PLATFORM)) {
    usage("PLATFORM must be grailed or depop.");
  }

  const tokens = await readTokens();
  const { listingId, created } = await maybeCreateListing();
  const shouldCleanup = CLEANUP || created;

  console.log(`Using API ${API_URL}`);
  console.log(`Listing ${listingId}`);
  console.log(`Platform ${PLATFORM}`);

  if (!SKIP_CONNECT) {
    console.log("\n1. Saving marketplace connection...");
    const connection = await request("POST", "/api/connect", {
      platform: PLATFORM,
      tokens,
      ...(PLATFORM_USERNAME ? { platformUsername: PLATFORM_USERNAME } : {}),
      ...(EXPIRES_AT ? { expiresAt: EXPIRES_AT } : {}),
    });

    console.log("Connection saved:");
    console.log(JSON.stringify(connection, null, 2));
  } else {
    console.log("\n1. Skipping /api/connect (SKIP_CONNECT=1)");
  }

  console.log("\n2. Publishing listing...");
  const publishResult = await request("POST", "/api/publish", {
    listingId,
    platforms: [PLATFORM],
  });

  console.log("Publish result:");
  console.log(JSON.stringify(publishResult, null, 2));

  const publishOk = Boolean(
    publishResult
      && typeof publishResult === "object"
      && "results" in publishResult
      && publishResult.results
      && typeof publishResult.results === "object"
      && publishResult.results[PLATFORM]
      && typeof publishResult.results[PLATFORM] === "object"
      && publishResult.results[PLATFORM].ok === true
  );

  if (CHECK_STATUS) {
    console.log("\n3. Checking status...");
    const statusResult = await request("GET", `/api/status/${listingId}`);
    console.log("Status result:");
    console.log(JSON.stringify(statusResult, null, 2));
  }

  if (shouldCleanup) {
    await cleanupListing(listingId, PLATFORM, publishOk);
  }
}

main().catch((error) => {
  console.error(`\nSmoke publish failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
