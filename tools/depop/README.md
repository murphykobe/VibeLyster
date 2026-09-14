# @vibelyster/depop-cli

Proof-of-concept CLI for Depop's internal API. Uses [`impit`](https://github.com/apify/impit) to mimic Chrome TLS fingerprints and bypass Cloudflare bot detection.

Reverse-engineered from browser DevTools network traffic and verified against live API (2026-03-27). See [marketplace API research](../../docs/marketplace-api-research.md) for full technical details.

---

## Quick Start

```bash
# No install needed — run directly
node tools/depop/cli.js --help

# Or link globally
cd tools/depop && npm link
depop --help
```

---

## Authentication

Only the **bearer token** is required. User ID is auto-resolved from the API.

```bash
# Option 1: interactive login (saves to ~/.vibelyster/depop.json)
depop login

# Option 2: env var
export DEPOP_ACCESS_TOKEN="your-access-token"

# Option 3: per-command flag
depop auth --access-token "..."
```

**To get your access token:**
1. Log into depop.com in your browser
2. Open DevTools → Application → Cookies → depop.com
3. Copy the `access_token` cookie value

> **Note:** Depop uses Cloudflare TLS fingerprinting (JA3/JA4) to block non-browser clients. This CLI uses `impit` (Rust-based Chrome TLS mimic) to bypass this — no real browser required.

---

## Commands

```bash
depop login                           # Save your access token
depop auth                            # Check login status
depop logout                          # Remove saved credentials
depop listings                        # List your products
depop listing <slug>                  # Get product details
depop addresses                       # List shipping addresses
depop inbox [--since <iso>] [--unread] # List conversations (read-only, normalized)
depop conversation <id>               # Get one conversation's full thread (read-only, normalized)
depop upload <image-path>             # Upload a square image → {id, url}
depop create <json-file>              # Create a draft listing
depop drafts                          # List draft listings
depop draft-update <id> <json-file>   # Update a draft
depop draft-delete <id>               # Delete a draft
depop edit <product-id> <json-file>   # Edit a live product in-place
depop delete <product-id>             # Delete a live product
```

---

## Listing Lifecycle

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│   1. Upload images       depop upload ./photo.jpg                │
│      └─ Two-step: POST JSON → presigned S3 URL → PUT image      │
│      └─ Returns {id, url}                                        │
│      └─ Images MUST be square (Depop rejects non-square)         │
│                                                                  │
│   2. Create draft        depop create draft.json                 │
│      └─ POST /api/v2/drafts/ (direct POST to products fails)    │
│      └─ Returns {id} (UUID)                                      │
│                                                                  │
│   3. Manage drafts       depop drafts / draft-update / draft-del │
│      └─ GET/PUT /api/v2/drafts/  DELETE /api/v1/drafts/         │
│                                                                  │
│   4. Publish             Open draft in browser and click Post    │
│      └─ depop.com/sellinghub/drafts/edit/<draft-id>/             │
│      └─ No API-only publish endpoint found yet                   │
│                                                                  │
│   5. Edit live listing   depop edit <id> updates.json            │
│      └─ PUT /api/v2/products/<id>/                               │
│                                                                  │
│   6. Delete listing      depop delete <id>                       │
│      └─ DELETE /api/v1/products/<id>/ (v1, not v2)               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Cloudflare TLS Bypass

Depop's API (`webapi.depop.com`) is behind Cloudflare which fingerprints the TLS handshake (JA3/JA4) to distinguish browsers from automated clients. Standard Node.js `fetch()` and `curl` are blocked with 403 regardless of headers or cookies.

**Solution:** [`impit`](https://github.com/apify/impit) — a Rust-based (`reqwest` + `napi-rs`) drop-in `fetch()` replacement that uses Chrome's cipher suites and TLS configuration. Zero npm dependencies, prebuilt native binaries, Apache-2.0 license.

```
Node.js fetch()  →  JA3: Node.js fingerprint  →  Cloudflare 403
impit.fetch()    →  JA3: Chrome fingerprint    →  Cloudflare 200
```

---

## Inbox (read-only)

```bash
depop inbox [--since <iso>] [--unread]   # List conversations
depop conversation <id>                  # Get one conversation's full thread
```

Both accept `--json` and return a normalized shape, not Depop's raw one:

```jsonc
// depop inbox --json
{ "conversations": [
  { "id": "a9e2e08bc54174314044eb18a7ff1a6d", "listing_id": 909240036, "buyer": "lurkthestreet",
    "last_message_id": "04BCA671-F2DA-44D8-833B-F2F746AE77CF", "last_message_text": "Lowest I'll go is $120",
    "last_message_at": "2026-09-13T19:23:58.000Z", "last_message_from": "seller", "unread": false }
] }

// depop conversation <id> --json
{ "conversation": { "id": "de9315b5", "listing_id": 12345, "buyer": "buyerhandle",
  "messages": [ { "id": "FB88B425", "from": "buyer", "text": "May I have the chest measurement...", "at": "2026-08-10T..." } ] } }
```

**Known limitations, deliberately not guessed at:**
- **`inbox` only sees page 1 (newest ~20 conversations).** The list endpoint's `page_info` has `first`/`last`/`has_more`, but the actual next-page query param name was never found — `cursor`, `after`, `starting_after`, `next`, `page_cursor`, `next_cursor`, `starting_cursor`, and `from_cursor` were all tried live against `GET /presentation/api/v1/conversations/` and every one was silently ignored (same page 1 came back every time). For a personal account's `--since <last_run>` use case this is very unlikely to matter — it only becomes a real gap if 20+ conversations each got a new message in a single day.
- **`inbox` makes N+1 requests** (one `getMessages` call per conversation, to determine `last_message_from` — Depop's list endpoint doesn't say who sent the last message, unlike Grailed's). ~20 conversations takes a few seconds.
- **No write endpoints implemented.** Found in the frontend bundle: `POST /presentation/api/v1/conversations/messages/` (send — body shape unknown), `POST .../mark-read/`, `POST .../mark-unread/`, `POST .../hide/`. None verified live — needs a real DevTools "Copy as cURL" capture of an actual send before implementing.
- **Automated Depop system notifications appear as regular messages** (e.g. "Team Depop" account-security emails, observed with an id like `braze-32` instead of a UUID) — not filtered here, since the CLI returns data as-is; a future classification layer should learn to recognize and skip these.

---

## Architecture

```
tools/depop/
├── cli.js              CLI entry point (args, routing, output formatting)
├── depop-api.js        API client (impit fetch, all endpoints)
├── README.md           This file
├── package.json        @vibelyster/depop-cli
└── examples/           Payload templates (TODO)
```

### API Auth Flow

```
access_token cookie from browser
        ↓
  Authorization: Bearer <token>
        ↓
  webapi.depop.com/api/* (via impit for TLS fingerprint)
        ↓
  userId auto-resolved from /api/v1/addresses/
```

### API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/sellerOnboarding/sellerStatus/` | Auth check + seller status |
| GET | `/api/v1/addresses/` | Shipping addresses (also returns userId) |
| GET | `/api/v3/shop/{userId}/products/` | User's listings |
| GET | `/api/v1/product/by-slug/{slug}/user/` | Product detail by slug |
| POST | `/api/v2/pictures/` | Presigned S3 URL for image upload |
| POST | `/api/v2/drafts/` | Create draft listing |
| GET | `/api/v2/drafts/` | List drafts |
| PUT | `/api/v2/drafts/{id}/` | Update draft |
| DELETE | `/api/v1/drafts/{id}/` | Delete draft (v1, not v2) |
| PUT | `/api/v2/products/{id}/` | Edit live product |
| DELETE | `/api/v1/products/{id}/` | Delete live product (v1, not v2) |
| GET | `/presentation/api/v1/conversations/` | Inbox list, page 1 only (see Inbox section) |
| GET | `/presentation/api/v1/conversations/{id}/` | Conversation detail (user, product, read_only) |
| GET | `/presentation/api/v1/conversations/{id}/messages/` | Messages, newest-first |

---

## Gotchas & Pitfalls

| Gotcha | Detail |
|--------|--------|
| **Images must be square** | Depop rejects non-square images. Crop before uploading. |
| **Product lookup uses slugs, not IDs** | `/api/v2/products/{slug}/` — get slugs from `depop listings` |
| **Cloudflare blocks Node.js fetch** | Must use `impit` or equivalent Chrome TLS fingerprint tool |
| **`depop-UserId` header is optional** | Bearer token alone identifies the user |
| **userId needed in listings URL** | `/api/v3/shop/{userId}/products/` — auto-resolved and cached |
| **esbuild can't bundle impit** | `impit` uses native binaries (napi-rs) — must be marked as external for bundling |
