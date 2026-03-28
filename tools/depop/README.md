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
depop upload <image-path>             # Upload a square image → {id, url}
depop create <json-file>              # Create a product listing
depop edit <product-id> <json-file>   # Edit a live product in-place
depop delete <product-id>             # Delete a product
```

---

## Listing Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   1. Upload images       depop upload ./photo.jpg           │
│      └─ returns {id, url}                                   │
│      └─ Images MUST be square (Depop rejects non-square)    │
│                                                             │
│   2. Create listing      depop create listing.json          │
│      └─ POST /api/v2/products/                              │
│      └─ returns {id, slug}                                  │
│                                                             │
│   3. Edit listing        depop edit <id> updates.json       │
│      └─ PUT /api/v2/products/<id>/                          │
│                                                             │
│   4. Delete listing      depop delete <id>                  │
│      └─ DELETE /api/v2/products/<id>/                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
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
| GET | `/api/v2/products/{slug}/` | Product detail (alternate) |
| POST | `/api/v2/pictures/` | Image upload (FormData) |
| POST | `/api/v2/products/` | Create product |
| PUT | `/api/v2/products/{id}/` | Edit product |
| DELETE | `/api/v2/products/{id}/` | Delete product |

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
