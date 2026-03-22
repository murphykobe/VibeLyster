# Marketplace API Research

Reverse-engineered from Flyp Crosslister extension (v1.0.3) and Crosslist extension (v3.9.4).

## Industry Landscape

Every major cross-listing tool (Flyp, Vendoo, Crosslist, List Perfectly) uses the same core pattern: a Chrome extension that calls marketplace internal APIs using the user's authenticated browser session. No platform besides eBay offers a public listing creation API.

## Platform Integration Summary

| Platform | Public API? | Integration Method | Auth Mechanism |
|----------|------------|-------------------|----------------|
| eBay | Yes (Inventory API) | Server-side OAuth | OAuth 2.0, 18-month refresh token |
| Grailed | No | Extension → REST API | csrf_token cookie + x-csrf-token header |
| Depop | No | Extension → REST API | access_token cookie as Bearer token |
| Poshmark | No | Extension → REST API | Session cookies + X-XSRF-TOKEN header |
| Mercari | No | Extension → GraphQL API | window.csrf from page context |
| Facebook | No | Extension → GraphQL + DOM hybrid | fb_dtsg token + webRequest interception |

---

## Grailed API (from Crosslist extension)

**Base URL**: `https://www.grailed.com/api/`

**Auth**:
- CSRF token: read from `csrf_token` cookie on grailed.com
- Session: browser cookies via `credentials: "include"` (or Cookie header)
- Required headers:
  ```
  x-csrf-token: {csrf_token}
  x-api-version: application/grailed.api.v1
  Content-Type: application/json
  Accept: application/json
  ```

### Endpoints

#### Authentication & User

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/api/users/me` | Yes | Returns user ID, username, email |
| GET | `/api/users/{id}/postal_addresses` | Yes | Required before posting (must have address) |

#### Categories & Brands

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/api/config/categories` | No | Full category tree with subcategories |
| POST | Algolia: `mnrwefss2q-dsn.algolia.net` | No (public key) | Brand search. App ID: MNRWEFSS2Q, Key: bc9ee1c014521ccf312525a4ef324a16 |

**Algolia brand search body**:
```json
{
  "params": "query=Nike&page=0&hitsPerPage=5&filters=departments:menswear"
}
```

Returns: `{ id, name, slug, departments, logo_url }`

#### Image Upload (2-step presigned S3)

1. `GET /api/photos/presign/listing` (auth required)
   - Returns: `{ data: { fields: {...}, image_url: "https://..." } }`

2. `POST https://grailed-media.s3.amazonaws.com/`
   - FormData with all fields from presign response
   - Append `Content-Type: image/jpeg` and `file: <image blob>`
   - The `image_url` from step 1 is the final URL to use in listings

#### Listing CRUD

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| POST | `/api/listings` | Yes | Create listing. Returns `{ data: { id, pretty_path } }` |
| PUT | `/api/listings/{id}` | Yes | Update listing |
| DELETE | `/api/listings/{id}` | Yes | Delete listing |
| GET | `/api/listings/{id}` | No | Get listing details (public) |

#### User Listings & Sales

| Method | Endpoint | Auth | Notes |
|--------|----------|------|-------|
| GET | `/api/users/{id}/wardrobe?page={n}&limit={n}` | Optional | Paginated. Returns `metadata.is_last_page` |
| GET | `/api/users/{id}/transactions/sales?page={n}&limit={n}` | Yes | Sales history with fee breakdown |

### Listing Data Model

From `GET /api/listings/{id}` response:

```json
{
  "id": 123456,
  "title": "Item Title",
  "description": "Full description...",
  "price": 150,
  "size": "m",
  "exact_size": null,
  "condition": "is_gently_used",
  "category": "outerwear",
  "subcategory": "Heavy Coats",
  "category_path": "outerwear.heavy_coats",
  "department": "menswear",
  "make_offer": true,
  "designers": [{ "id": 162, "name": "Hugo Boss", "slug": "hugo-boss" }],
  "photos": [{ "id": 802970, "url": "https://media-assets.grailed.com/..." }],
  "traits": [{ "name": "color", "value": "black" }],
  "hashtags": [],
  "shipping": {
    "us": { "amount": 20, "enabled": true },
    "ca": { "amount": 15, "enabled": true }
  }
}
```

**Condition values**: `is_new`, `is_gently_used`, `is_used`, `is_worn`, `is_not_specified`

**Category path format**: `{category}.{subcategory}` e.g., `tops.long_sleeve_shirts`, `outerwear.heavy_coats`

### Verified Endpoints (tested live)

| Endpoint | Status | Result |
|----------|--------|--------|
| `GET /api/config/categories` | 200 | Full category tree returned |
| `GET /api/users/me` | 401 | "You must be logged in" (expected without auth) |
| `GET /api/listings/123456` | 200 | Complete listing data returned |
| `GET /api/photos/presign/listing` | 401 | Auth required (expected) |
| Algolia brand search | 200 | Nike: id=30, 445K listings |

---

## Depop API (from Flyp + Crosslist extensions)

**Base URL**: `https://webapi.depop.com/`

**Auth**:
- Bearer token: `access_token` cookie from depop.com
- User ID: `user_id` cookie from depop.com
- Anti-bot: `_px2` cookie (PerimeterX) — may cause issues for server-side replay

**Headers**:
```
Authorization: Bearer {access_token}
depop-UserId: {user_id}
Content-Type: application/json
```

### Key Endpoints

| Method | Endpoint | Notes |
|--------|----------|-------|
| POST | `/api/v2/products/` | Create listing |
| POST | `/api/v2/pictures/` | Upload image (returns presigned S3 URL) |
| GET | `/api/v1/shop/products/?limit=200&statusFilter=selling` | List user's products |
| GET | `/api/v2/product/userProductView/{id}` | Get single product |
| GET | `/api/v1/addresses/` | Get user addresses |
| GET | `/api/v1/auth/identify/` | Check login status |

**Image upload**: Depop requires square images. Crosslist uses `OffscreenCanvas` + `createImageBitmap` to center-crop before upload.

**Risk**: PerimeterX (`_px2` cookie) is a browser fingerprinting anti-bot system. Server-side token replay is more likely to be blocked compared to Grailed.

---

## eBay API (official)

**Approach**: Official OAuth API, fully server-side.

**Flyp uses**: `flyp-tools-api.herokuapp.com/api/v2/ebay/` — their own server proxies all eBay API calls.

**Key APIs**:
- Inventory API: `createOrReplaceInventoryItem`, `createOffer`, `publishOffer`
- Trading API (legacy): `AddItem`, `AddFixedPriceItem`
- Taxonomy API: category lookups
- Fulfillment API: order management

**Auth**: OAuth 2.0 with 18-month refresh tokens. User connects once via consent flow.

---

## Poshmark API (from Flyp extension — reference only)

**Base URL**: `https://poshmark.com/`

**Listing creation flow**:
1. `POST /vm-rest/users/{userId}/posts` — create empty draft
2. `POST /api/posts/{postId}/media/scratch` — upload image (FormData)
3. `POST /vm-rest/posts/{postId}` — update with listing data + `X-XSRF-TOKEN` header
4. `PUT /vm-rest/posts/{postId}/status/published?app_version=5.04&user_certified=true` — publish

**Auth**: Session cookies (implicit in browser), CSRF from `__INITIAL_STATE__` in page HTML, JWT cookie for bulk operations.

---

## Mercari API (from Flyp extension — reference only)

**Base URL**: `https://www.mercari.com/v1/api/`

**Approach**: GraphQL API via page-context script injection.

**Key operations**:
- `uploadTempListingPhotos` — image upload
- `createListing` — create listing
- `UpdateItemStatusMutation` — delist
- `sellFetchItemsDetails` — get listing details

**Auth**: `window.csrf` + `window.dfpDeviceInfo` from Mercari's page JS context.

---

## Flyp Extension Architecture

**Extension ID**: `kbflhgfmfbghhjafnjbgpiopcdjeajio` (v1.0.3)

**Two code generations**:
- V1: Tab orchestration — opens hidden tabs, content scripts drive interaction
- V2: Direct API — service worker makes fetch() calls directly (current direction)

**Platforms in extension**: Poshmark, Mercari, Facebook, Depop
**NOT in extension**: eBay (server-side), Grailed (not supported)

**Stealth techniques**:
- `declarativeNetRequest` to strip CSP headers (Facebook) and spoof Origin/Referer/User-Agent headers
- React Testing Library `fireEvent` for Facebook DOM automation
- `webRequest.onBeforeRequest` to intercept Facebook's own GraphQL requests and steal auth tokens
- Mercari User-Agent spoofed to `mercari_b/flyp`

**Flyp backend**: `flyp-tools-api.herokuapp.com`
- Handles eBay via official API (server-side)
- Stores item data and photos on S3 (`flyp-lister-photos.s3-us-east-2.amazonaws.com`)
- Receives listing status updates from extension after marketplace posting
- Error logging at `/listingErrors`

---

## Crosslist Extension Architecture

**Extension ID**: `knfhdmkccnbhbgpahakkcmoddgikegjl` (v3.9.4)

**Approach**: Pure API calls from background service worker. Content script is minimal (14KB).

**Platforms**: Poshmark, Mercari, Facebook, Depop, Grailed, eBay, Etsy, Vinted, Shopify, Whatnot, Bonanza, Vestiaire Collective

**Grailed integration source**: This is where we reverse-engineered the Grailed API. Crosslist calls Grailed's REST API directly from the service worker.

**Header spoofing (marketplaceRules.json)**:
- Grailed: Origin → grailed.com, Referer → grailed.com/sell
- Grailed images: Origin/Referer spoofed for filepicker.io (S3 uploads)
- Depop: Origin → depop.com, Referer → depop.com/products/create/
- Mercari: User-Agent → `mercari_b/crosslist`
- Facebook: CSP-related, Origin/Referer spoofing

---

## Key Takeaways for VibeLyster

1. **Grailed has a clean REST API** — simplest of all non-eBay platforms to integrate
2. **eBay has official OAuth API** — fully server-side, no extension needed
3. **Depop is API-based but has PerimeterX anti-bot** — higher risk for server-side replay
4. **Chrome extension is the proven pattern** — all successful tools use it
5. **The extension's role is minimal** — just auth + API calls, no DOM manipulation for Grailed/Depop
6. **Future migration path**: Extension → token sync → fully server-side (not a one-way door)
