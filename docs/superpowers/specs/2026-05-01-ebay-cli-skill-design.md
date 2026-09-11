# eBay CLI + Agent Skill Design

**Date:** 2026-05-01
**Status:** Approved
**Scope:** `@vibelyster/ebay-cli` npm package + `ebay-listing/SKILL.md` agent skill

## Goal

Add eBay as a third marketplace to the VibeLyster CLI tool suite and GrailedAgent skill collection. An AI agent reads the SKILL.md, calls CLI commands via bash, and can create/publish eBay listings — same workflow as Grailed and Depop.

## Architecture

Two deliverables in two repos:

### 1. CLI — `VibeLyster/tools/ebay/`

```
tools/ebay/
├── cli.js              # Command routing, arg parsing, output formatting
├── ebay-api.js         # API client wrapping hendt/ebay-api
├── package.json        # @vibelyster/ebay-cli
├── dist/
│   └── cli.js          # esbuild bundled output
└── examples/
    └── draft.json      # Listing payload template
```

Published to npm as `@vibelyster/ebay-cli`. Runnable via `npx @vibelyster/ebay-cli <command>` or installed globally as `ebay`.

### 2. Skill — `GrailedAgent/ebay-listing/`

```
ebay-listing/
├── SKILL.md            # Agent skill definition
└── examples/
    └── draft.json      # Payload template
```

## SDK

Uses [`ebay-api`](https://github.com/hendt/ebay-api) (hendt) as the underlying SDK — 200+ stars, active, full REST + Trading API coverage, built-in OAuth2 auto-refresh.

**Why not build from scratch:** eBay's API surface is massive (Inventory, Trading, Taxonomy, Account). The library handles auth token lifecycle, XML serialization for Trading API, and typed responses. No reason to reimplement.

**Why not reuse VibeLyster server code:** VibeLyster's eBay module is coupled to the server (Clerk auth, Neon DB, Vercel Blob). The CLI needs to be standalone with zero infrastructure dependencies.

## Authentication

Three environment variables, no file storage:

| Variable | Description | Source |
|----------|-------------|--------|
| `EBAY_APP_ID` | Client ID (application credentials) | eBay Developer Portal |
| `EBAY_CERT_ID` | Client Secret (application credentials) | eBay Developer Portal |
| `EBAY_REFRESH_TOKEN` | User refresh token (long-lived, ~18 months) | OAuth consent flow |

The `ebay-api` library is initialized with these and `autoRefreshToken: true`. Access tokens are obtained and refreshed automatically by the SDK when a refresh token is present. The CLI should not implement a second refresh layer, but it should listen for the SDK's `refreshAuthToken` event in debug/test paths so manual smoke tests can confirm refresh behavior.

No `login`/`logout` commands. No `~/.vibelyster/ebay.json`. Pure env vars, same pattern as Grailed's `GRAILED_CSRF_TOKEN` + `GRAILED_COOKIES`.

### How to get the refresh token

The user already has production eBay OAuth credentials from the VibeLyster project (App ID and RuName configured in VibeLyster's `.env.local`).

To get a refresh token: complete the OAuth consent flow (browser → eBay login → authorize → callback with auth code → exchange for refresh token). The VibeLyster app already handles this; for agent work, use the existing VibeLyster OAuth flow or the eBay Developer Portal token tool, then export the refresh token as `EBAY_REFRESH_TOKEN`.

## Commands

| Command | Auth | Description |
|---------|------|-------------|
| `ebay auth` | Yes | Verify credentials (calls eBay Identity API) |
| `ebay categories <query>` | Yes | Search category tree by keyword via Taxonomy API |
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

### Command details

**`ebay create <json-file>`** — The core command. Internally does three things:
1. Generates a deterministic SKU: `vl-{Date.now()}`
2. Calls `createOrReplaceInventoryItem(sku, ...)` with title, description, condition, images, aspects
3. Calls `createOffer(...)` with SKU, categoryId, price, policies, merchantLocationKey
4. Outputs: SKU and offer ID

Policy auto-fetch: on `create`, the CLI fetches the user's existing fulfillment/payment/return policies and picks the first of each type. Override with `--fulfillment-policy`, `--payment-policy`, `--return-policy` flags if needed.

**`ebay publish <offerId>`** — Publishes the offer, returns the listing ID and eBay URL.

**`ebay edit <sku> <json-file>`** — Updates the inventory item (title, description, images, aspects, condition) and its associated offer (price, categoryId) in one call.

**`ebay delete <sku>`** — Withdraws the published offer first (if published), then deletes the inventory item.

**`ebay categories <query>`** — Calls eBay Taxonomy API `getCategorySuggestions()`. Returns top 5 suggested categories with IDs. The agent always queries this — no hardcoded category guessing.

**`ebay aspects <categoryId>`** — Calls `getItemAspectsForCategory()`. Returns required and recommended aspects with their allowed values. The agent uses this to know exactly which fields to include in the draft JSON.

## Listing Payload Format

The JSON file passed to `ebay create`:

```json
{
  "title": "Rick Owens DRKSHDW Ramones High Top Sneakers",
  "description": "Size 43, worn twice. Excellent condition, no visible wear. Comes with original box.",
  "condition": "USED_EXCELLENT",
  "categoryId": "15709",
  "price": "450.00",
  "quantity": 1,
  "images": [
    "https://i.ebayimg.com/images/g/..."
  ],
  "aspects": {
    "Brand": ["Rick Owens"],
    "Department": ["Men"],
    "US Shoe Size": ["10"],
    "Color": ["Black"],
    "Material": ["Leather"]
  },
  "merchantLocationKey": "default"
}
```

**Field notes:**
- `condition` — string enum, mapped internally to eBay condition ID
- `price` — string in USD (matches eBay API format)
- `images` — array of eBay-hosted URLs from `ebay upload`
- `aspects` — key-value pairs where values are always arrays (eBay's format)
- `categoryId` — from `ebay categories` lookup
- `merchantLocationKey` — from `ebay locations` lookup
- `quantity` — defaults to 1 if omitted

## Condition Mapping

| User says | CLI enum | eBay condition ID |
|-----------|----------|-------------------|
| new, brand new, nwt, deadstock | `NEW` | 1000 |
| like new, open box, excellent | `NEW_OTHER` | 1500 |
| gently used, used, good | `USED_EXCELLENT` | 3000 |
| heavily used, worn, fair | `USED_ACCEPTABLE` | 7000 |

## Image Upload

Uses the eBay Trading API (`UploadSiteHostedPictures`) — XML multipart, not REST.

**Flow:**
1. Read image file from disk
2. Build XML payload with `form-data`
3. Call `eBay.trading.UploadSiteHostedPictures()` via hendt/ebay-api
4. Return the `FullURL` (eBay-hosted CDN URL)

No square-crop requirement (unlike Depop). eBay recommends minimum 500px on longest side.

The agent uploads all images first, collects URLs, then passes them into the `ebay create` JSON — same workflow as Grailed.

## Package Configuration

```json
{
  "name": "@vibelyster/ebay-cli",
  "version": "0.1.0",
  "description": "CLI for eBay Sell API — list, create, edit, and manage eBay listings",
  "type": "module",
  "bin": { "ebay": "./dist/cli.js" },
  "files": ["dist/"],
  "scripts": {
    "build": "esbuild cli.js --bundle --platform=node --format=esm --minify --external:ebay-api --outfile=dist/cli.js",
    "prepublishOnly": "npm run build"
  },
  "engines": { "node": ">=18" },
  "dependencies": {
    "ebay-api": "^9.5.1",
    "form-data": "^4.0.0"
  },
  "devDependencies": {
    "esbuild": "^0.25.0"
  }
}
```

**Note:** `ebay-api` is marked as external in esbuild (like Depop's `impit`) because it has native/complex dependencies that don't bundle cleanly. It's installed as a runtime dependency.

## SKILL.md Structure

Mirrors grailed-listing/SKILL.md exactly:

1. **Frontmatter** — name, description, compatibility, metadata
2. **Prerequisites** — Node 18+, env vars
3. **CLI Tool** — npx usage, command table
4. **Authentication** — env var setup, verification
5. **Workflow: Creating a Listing** — step-by-step with example commands
   - Parse user input
   - Look up category: `ebay categories "<query>"`
   - Look up required aspects: `ebay aspects <categoryId>`
   - Upload images: `ebay upload <path>` for each
   - Build listing JSON
   - Create: `ebay create /tmp/ebay-listing.json`
   - Publish: `ebay publish <offerId>`
   - Confirm to user
6. **Workflow: Updating a Listing** — `ebay listing <sku>` → modify → `ebay edit <sku> <json>`
7. **Error Recovery** — common errors and fixes
8. **Gotchas & Pitfalls** — eBay-specific traps
9. **Condition Mapping** — table
10. **Common Categories** — quick reference (hints, not source of truth — always verify via `ebay categories`)
11. **Example Interaction** — full walkthrough

## Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `Invalid access token` | Refresh token expired (~18 months) | Re-run OAuth consent flow for new refresh token |
| `The item specific Brand is missing` | Required aspect not provided | Run `ebay aspects <categoryId>` to see required fields |
| `Invalid category ID` | Wrong category | Run `ebay categories` to search |
| `Listing policy not found` | Policy ID doesn't exist | Run `ebay policies` to see available policies |
| `Merchant location not found` | Location key doesn't exist | Run `ebay locations` to see available locations |
| `Duplicate SKU` | SKU already in use | Timestamp-based SKUs make this unlikely; delete old item first |
| `Image upload failed` | File too large or wrong format | eBay accepts JPEG/PNG, max 12MB |

## Out of Scope

- **Auction listings** — fixed-price only (reselling pattern)
- **Multi-variation listings** — single-item only
- **Bulk operations** — one listing at a time
- **Order management** — listing creation only, not fulfillment
- **Promoted listings** — no advertising API integration
- **eBay Motors / Real Estate** — standard categories only

## Relationship to VibeLyster

The CLI is standalone — no dependency on VibeLyster server, Clerk, Neon, or Vercel. However:
- Uses the same eBay developer app (same Client ID / Secret)
- Uses the same OAuth refresh token (same eBay user account)
- Category/condition patterns were informed by VibeLyster's `ebay-metadata.ts`
- Follow-on parity items for VibeLyster: image upload + SDK-backed auto token refresh verification
