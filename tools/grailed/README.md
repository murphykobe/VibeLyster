# @vibelyster/grailed-cli

Proof-of-concept CLI for Grailed's internal API. Zero dependencies — uses native Node.js `fetch` (Node 18+).

Reverse-engineered from the [Crosslist Chrome extension](https://chromewebstore.google.com/detail/crosslist/) and verified against live API (2026-03-27). See [marketplace API research](../../docs/marketplace-api-research.md) for full technical details.

---

## Quick Start

```bash
# No install needed — run directly
node tools/grailed/cli.js --help

# Or link globally
cd tools/grailed && npm link
grailed --help
```

---

## Authentication

All write operations require a CSRF token and session cookies from your browser.

```bash
# Option 1: env vars (recommended)
export GRAILED_CSRF_TOKEN="your-csrf-token"
export GRAILED_COOKIES="_grailed_session=...; csrf_token=..."

# Option 2: per-command flags
grailed auth --csrf-token "..." --cookies "..."
```

**To get your tokens:**
1. Log into grailed.com in your browser
2. Open DevTools → Application → Cookies
3. Copy the `csrf_token` cookie value → `GRAILED_CSRF_TOKEN`
4. Copy all cookies as a string → `GRAILED_COOKIES`

> **Note:** Cloudflare cookies (`__cf_bm`, `cf_clearance`) expire frequently. If you get 401 errors, refresh your cookies.

---

## Commands

### Public (no auth required)

```bash
grailed brand <query> [department]    # Search brands via Algolia
grailed categories                    # List full category tree
grailed listing <id>                  # View any listing by ID (public)
```

### Authenticated

```bash
grailed auth                          # Check login status
grailed wardrobe                      # List your active listings
grailed drafts                        # List your drafts
grailed addresses                     # List shipping addresses (need return_address_id for publish)
grailed upload <image-path>           # Upload image → returns S3 URL for use in listings
grailed create <json-file>            # Create a draft from JSON (see Draft Payload below)
grailed publish <draft-id> [json-file] # Publish a draft (2-step: update + submit)
grailed publish <json-file>           # Publish directly (skip draft, see Publish Payload below)
grailed delete <listing-or-draft-id>  # Delete a listing or draft
```

---

## Listing Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   1. Upload images        grailed upload ./photo.jpg                │
│      └─ returns URL       https://media-assets.grailed.com/...      │
│                                                                     │
│   2. Create draft         grailed create draft.json                 │
│      └─ returns draft ID  [15795544]                                │
│                                                                     │
│   3. Publish draft        grailed publish 15795544 publish.json     │
│      └─ Step A: PUT /api/listing_drafts/15795544  (update)          │
│      └─ Step B: POST /api/listing_drafts/15795544/submit (go live)  │
│      └─ returns listing URL                                         │
│                                                                     │
│   Alternative: publish directly (skip draft)                        │
│      grailed publish publish.json                                   │
│      └─ POST /api/listings                                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Draft Payload (`examples/listing.json`)

Used with `grailed create`. Creates a draft on Grailed (not live until published).

```jsonc
{
  // ─── REQUIRED FIELDS ──────────────────────────────────────────────

  "title": "Vintage Nike Air Max 97 Silver Bullet",
  // Max ~100 chars. Shown in search results and listing page.

  "description": "Classic Nike Air Max 97 in the iconic Silver Bullet colorway...",
  // Full listing description. Supports line breaks (\n). No HTML.

  "price": 120,
  // Draft price is a NUMBER (not string). In USD, no cents.

  "category_path": "footwear.lowtop_sneakers",
  // Must be a valid path from the Category Tree below.
  // Format: "{category}.{subcategory}" e.g. "tops.sweaters_knitwear"

  "designers": [
    { "id": 30, "name": "Nike", "slug": "nike" }
  ],
  // MUST be objects with id/name/slug — NOT string arrays.
  // Look up via: grailed brand "Nike"
  // At least one designer required.

  "condition": "is_gently_used",
  // One of: "is_new", "is_gently_used", "is_used", "is_worn", "is_not_specified"

  "size": "10",
  // Free-text string. For one-size items use "one size" (WITH space, not "one_size").
  // Common values: "xs", "s", "m", "l", "xl", "xxl", "10", "10.5", "one size"

  "department": "menswear",
  // "menswear" or "womenswear". Must match the category_path's department.

  "make_offer": true,
  // Allow buyers to make offers. DRAFT uses underscores (make_offer).

  "buy_now": true,
  // Enable Buy Now button. DRAFT uses underscores (buy_now).

  "photos": [
    {
      "url": "https://media-assets.grailed.com/prd/listing/temp/...",
      "width": 1080,
      "height": 1920,
      "rotate": 0,
      "position": 0
    }
  ],
  // MUST be objects with url/width/height/rotate/position — NOT just URL strings.
  // url: from `grailed upload` command
  // width/height: image dimensions in pixels
  // rotate: rotation in degrees (0, 90, 180, 270)
  // position: display order (0-indexed)
  // At least one photo required.

  "shipping": {
    "us":    { "amount": 15, "enabled": true },
    "ca":    { "amount": 25, "enabled": false },
    "uk":    { "amount": 0,  "enabled": false },
    "eu":    { "amount": 0,  "enabled": false },
    "asia":  { "amount": 0,  "enabled": false },
    "au":    { "amount": 0,  "enabled": false },
    "other": { "amount": 0,  "enabled": false }
  },
  // amount: shipping cost in USD
  // enabled: whether to ship to this region
  // At minimum, us should be enabled.

  // ─── OPTIONAL FIELDS ──────────────────────────────────────────────

  "traits": [
    { "name": "color", "value": "silver" },
    { "name": "country_of_origin", "value": "US" }
  ]
  // Optional item attributes. Each is { name, value }.
  // Known trait names: "color", "country_of_origin"
  // color values: "black", "white", "blue", "red", "green", "silver", "gold",
  //               "brown", "grey", "navy", "orange", "pink", "purple", "yellow",
  //               "multi", "cream"
}
```

---

## Publish Payload (`examples/publish.json`)

Used with `grailed publish <json-file>` (direct publish) or `grailed publish <draft-id> <json-file>` (update draft before submit).

**Key differences from draft payload:**

| Field | Draft (create) | Publish |
|-------|---------------|---------|
| `price` | Number (`120`) | **String** (`"120"`) |
| Offer toggle | `make_offer` (underscore) | **`makeoffer`** (no underscore) |
| Buy now toggle | `buy_now` (underscore) | **`buynow`** (no underscore) |
| `return_address_id` | Not needed | **Required** |
| `shipping_label` | Not needed | Required (`{ "free_shipping": false }`) |
| `duplicate_listing` | Not needed | Required (`false`) |
| `hidden_from_algolia` | Not needed | Required (`false`) |

```jsonc
{
  // ─── REQUIRED FIELDS ──────────────────────────────────────────────

  "title": "RRL Double RL Leather Passport Holder Green",

  "description": "RRL (Double RL) by Ralph Lauren leather passport holder...",

  "price": "500",
  // PUBLISH price is a STRING (not number). This is different from draft!

  "category_path": "accessories.wallets",

  "designers": [
    { "id": 35833, "name": "RRL Ralph Lauren", "slug": "rrl-ralph-lauren" }
  ],

  "condition": "is_new",

  "size": "one size",

  "makeoffer": true,
  // NO underscore! Different from draft's "make_offer".

  "buynow": true,
  // NO underscore! Different from draft's "buy_now".

  "return_address_id": 7145711,
  // REQUIRED for publish. Get via: grailed addresses
  // This is the numeric ID of your shipping address on Grailed.

  "photos": [
    {
      "url": "https://media-assets.grailed.com/prd/listing/temp/...",
      "width": 1080,
      "height": 1920,
      "rotate": 0,
      "position": 0
    }
  ],

  "shipping": {
    "us":    { "amount": 15, "enabled": true },
    "ca":    { "amount": 20, "enabled": false },
    "uk":    { "amount": 0,  "enabled": false },
    "eu":    { "amount": 0,  "enabled": false },
    "asia":  { "amount": 0,  "enabled": false },
    "au":    { "amount": 0,  "enabled": false },
    "other": { "amount": 0,  "enabled": false }
  },

  "shipping_label": { "free_shipping": false },
  // Required for publish. Set free_shipping: true to offer free shipping.

  "duplicate_listing": false,
  // Required. Set true only if relisting an existing item.

  "hidden_from_algolia": false,
  // Required. Set true to hide from Grailed search (rare).

  // ─── OPTIONAL FIELDS ──────────────────────────────────────────────

  "traits": [
    { "name": "color", "value": "green" },
    { "name": "country_of_origin", "value": "US" }
  ],

  "measurements": [],
  // Array of measurement objects. Usually empty.

  "styles": [],
  // Array of style tags. Usually empty.

  "exact_size": null,
  // Numeric exact size (e.g. 10.5). null if not applicable.

  "minimum_price": null
  // Minimum offer price. null to accept any offer.
}
```

---

## Field Reference (Quick Lookup)

### Required for Draft (`POST /api/listing_drafts`)

| Field | Type | Example | Notes |
|-------|------|---------|-------|
| `title` | string | `"Nike Air Max 97"` | Item title |
| `description` | string | `"Classic sneaker..."` | Full description |
| `price` | number | `120` | USD, no cents |
| `category_path` | string | `"footwear.lowtop_sneakers"` | See Category Tree |
| `designers` | array | `[{id, name, slug}]` | From `grailed brand` |
| `condition` | string | `"is_gently_used"` | See Condition Values |
| `size` | string | `"10"` or `"one size"` | Free text |
| `department` | string | `"menswear"` | `menswear` or `womenswear` |
| `make_offer` | boolean | `true` | With underscore |
| `buy_now` | boolean | `true` | With underscore |
| `photos` | array | `[{url, width, height, rotate, position}]` | From `grailed upload` |
| `shipping` | object | `{us: {amount, enabled}, ...}` | See regions |

### Additional Required for Publish (`POST /api/listings` or `PUT` + `/submit`)

| Field | Type | Example | Notes |
|-------|------|---------|-------|
| `price` | **string** | `"120"` | String, not number! |
| `makeoffer` | boolean | `true` | **No** underscore |
| `buynow` | boolean | `true` | **No** underscore |
| `return_address_id` | number | `7145711` | From `grailed addresses` |
| `shipping_label` | object | `{"free_shipping": false}` | |
| `duplicate_listing` | boolean | `false` | |
| `hidden_from_algolia` | boolean | `false` | |

### Optional Fields

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `traits` | array | `[]` | `[{name, value}]` — color, country_of_origin |
| `measurements` | array | `[]` | Item measurements |
| `styles` | array | `[]` | Style tags |
| `exact_size` | number/null | `null` | Numeric size (e.g. 10.5) |
| `minimum_price` | number/null | `null` | Min offer to accept |

### Condition Values

| Value | Meaning |
|-------|---------|
| `is_new` | New/Never worn |
| `is_gently_used` | Gently used |
| `is_used` | Used |
| `is_worn` | Very worn |
| `is_not_specified` | Not specified |

### Shipping Regions

| Key | Region |
|-----|--------|
| `us` | United States |
| `ca` | Canada |
| `uk` | United Kingdom |
| `eu` | Europe |
| `asia` | Asia |
| `au` | Australia |
| `other` | Rest of world |

---

## Category Tree

Fetched live from `GET /api/config/categories` on 2026-03-27. Use the **`path`** value for the `category_path` field.

### Menswear

#### Tops (`tops`)
| Subcategory | `category_path` |
|-------------|----------------|
| Long Sleeve T-Shirts | `tops.long_sleeve_shirts` |
| Polos | `tops.polos` |
| Shirts (Button Ups) | `tops.button_ups` |
| Short Sleeve T-Shirts | `tops.short_sleeve_shirts` |
| Sweaters & Knitwear | `tops.sweaters_knitwear` |
| Sweatshirts & Hoodies | `tops.sweatshirts_hoodies` |
| Tank Tops & Sleeveless | `tops.sleeveless` |
| Jerseys | `tops.jerseys` |

#### Bottoms (`bottoms`)
| Subcategory | `category_path` |
|-------------|----------------|
| Casual Pants | `bottoms.casual_pants` |
| Cropped Pants | `bottoms.cropped_pants` |
| Denim | `bottoms.denim` |
| Leggings | `bottoms.leggings` |
| Overalls & Jumpsuits | `bottoms.jumpsuits` |
| Shorts | `bottoms.shorts` |
| Sweatpants & Joggers | `bottoms.sweatpants_joggers` |
| Swimwear | `bottoms.swimwear` |

#### Outerwear (`outerwear`)
| Subcategory | `category_path` |
|-------------|----------------|
| Bombers | `outerwear.bombers` |
| Cloaks & Capes | `outerwear.cloaks_capes` |
| Denim Jackets | `outerwear.denim_jackets` |
| Heavy Coats | `outerwear.heavy_coats` |
| Leather Jackets | `outerwear.leather_jackets` |
| Light Jackets | `outerwear.light_jackets` |
| Parkas | `outerwear.parkas` |
| Raincoats | `outerwear.raincoats` |
| Vests | `outerwear.vests` |

#### Footwear (`footwear`)
| Subcategory | `category_path` |
|-------------|----------------|
| Boots | `footwear.boots` |
| Casual Leather Shoes | `footwear.leather` |
| Formal Shoes | `footwear.formal_shoes` |
| Hi-Top Sneakers | `footwear.hitop_sneakers` |
| Low-Top Sneakers | `footwear.lowtop_sneakers` |
| Sandals | `footwear.sandals` |
| Slip Ons | `footwear.slip_ons` |

#### Tailoring (`tailoring`)
| Subcategory | `category_path` |
|-------------|----------------|
| Blazers | `tailoring.blazers` |
| Formal Shirting | `tailoring.formal_shirting` |
| Formal Trousers | `tailoring.formal_trousers` |
| Suits | `tailoring.suits` |
| Tuxedos | `tailoring.tuxedos` |
| Vests | `tailoring.vests` |

#### Accessories (`accessories`)
| Subcategory | `category_path` |
|-------------|----------------|
| Bags & Luggage | `accessories.bags_luggage` |
| Belts | `accessories.belts` |
| Glasses | `accessories.glasses` |
| Gloves & Scarves | `accessories.gloves_scarves` |
| Hats | `accessories.hats` |
| Jewelry & Watches | `accessories.jewelry_watches` |
| Wallets | `accessories.wallets` |
| Miscellaneous | `accessories.misc` |
| Periodicals | `accessories.periodicals` |
| Socks & Underwear | `accessories.socks_underwear` |
| Sunglasses | `accessories.sunglasses` |
| Supreme | `accessories.supreme` |
| Ties & Pocketsquares | `accessories.ties_pocketsquares` |

### Womenswear

#### Tops (`womens_tops`)
| Subcategory | `category_path` |
|-------------|----------------|
| Blouses | `womens_tops.blouses` |
| Bodysuits | `womens_tops.bodysuits` |
| Button Ups | `womens_tops.button_ups` |
| Crop Tops | `womens_tops.crop_tops` |
| Hoodies | `womens_tops.hoodies` |
| Long Sleeve T-Shirts | `womens_tops.long_sleeve_shirts` |
| Polos | `womens_tops.polos` |
| Short Sleeve T-Shirts | `womens_tops.short_sleeve_shirts` |
| Sweaters | `womens_tops.sweaters` |
| Sweatshirts | `womens_tops.sweatshirts` |
| Tank Tops | `womens_tops.tank_tops` |

#### Bottoms (`womens_bottoms`)
| Subcategory | `category_path` |
|-------------|----------------|
| Jeans | `womens_bottoms.jeans` |
| Joggers | `womens_bottoms.joggers` |
| Jumpsuits | `womens_bottoms.jumpsuits` |
| Leggings | `womens_bottoms.leggings` |
| Maxi Skirts | `womens_bottoms.maxi_skirts` |
| Midi Skirts | `womens_bottoms.midi_skirts` |
| Mini Skirts | `womens_bottoms.mini_skirts` |
| Pants | `womens_bottoms.pants` |
| Shorts | `womens_bottoms.shorts` |
| Sweatpants | `womens_bottoms.sweatpants` |

#### Outerwear (`womens_outerwear`)
| Subcategory | `category_path` |
|-------------|----------------|
| Blazers | `womens_outerwear.blazers` |
| Bombers | `womens_outerwear.bombers` |
| Coats | `womens_outerwear.coats` |
| Denim Jackets | `womens_outerwear.denim_jackets` |
| Down Jackets | `womens_outerwear.down_jackets` |
| Fur & Faux Fur | `womens_outerwear.fur_faux_fur` |
| Jackets | `womens_outerwear.jackets` |
| Leather Jackets | `womens_outerwear.leather_jackets` |
| Rain Jackets | `womens_outerwear.rain_jackets` |
| Vests | `womens_outerwear.vests` |

#### Dresses (`womens_dresses`)
| Subcategory | `category_path` |
|-------------|----------------|
| Mini Dresses | `womens_dresses.mini` |
| Midi Dresses | `womens_dresses.midi` |
| Maxi Dresses | `womens_dresses.maxi` |
| Gowns | `womens_dresses.gowns` |

#### Footwear (`womens_footwear`)
| Subcategory | `category_path` |
|-------------|----------------|
| Boots | `womens_footwear.boots` |
| Heels | `womens_footwear.heels` |
| Platforms | `womens_footwear.platforms` |
| Mules | `womens_footwear.mules` |
| Flats | `womens_footwear.flats` |
| Hi-Top Sneakers | `womens_footwear.hitop_sneakers` |
| Low-Top Sneakers | `womens_footwear.lowtop_sneakers` |
| Sandals | `womens_footwear.sandals` |
| Slip Ons | `womens_footwear.slip_ons` |

#### Accessories (`womens_accessories`)
| Subcategory | `category_path` |
|-------------|----------------|
| Belts | `womens_accessories.belts` |
| Glasses | `womens_accessories.glasses` |
| Gloves | `womens_accessories.gloves` |
| Hair Accessories | `womens_accessories.hair_accessories` |
| Hats | `womens_accessories.hats` |
| Miscellaneous | `womens_accessories.miscellaneous` |
| Scarves | `womens_accessories.scarves` |
| Socks & Intimates | `womens_accessories.socks_intimates` |
| Sunglasses | `womens_accessories.sunglasses` |
| Wallets | `womens_accessories.wallets` |
| Watches | `womens_accessories.watches` |

#### Bags & Luggage (`womens_bags_luggage`)
| Subcategory | `category_path` |
|-------------|----------------|
| Backpacks | `womens_bags_luggage.backpacks` |
| Belt Bags | `womens_bags_luggage.belt_bags` |
| Bucket Bags | `womens_bags_luggage.bucket_bags` |
| Clutches | `womens_bags_luggage.clutches` |
| Crossbody Bags | `womens_bags_luggage.crossbody_bags` |
| Handle Bags | `womens_bags_luggage.handle_bags` |
| Hobo Bags | `womens_bags_luggage.hobo_bags` |
| Luggage & Travel | `womens_bags_luggage.luggage_travel` |
| Messengers & Satchels | `womens_bags_luggage.messengers_satchels` |
| Mini Bags | `womens_bags_luggage.mini_bags` |
| Shoulder Bags | `womens_bags_luggage.shoulder_bags` |
| Toiletry Pouches | `womens_bags_luggage.toiletry_pouches` |
| Tote Bags | `womens_bags_luggage.tote_bags` |
| Other | `womens_bags_luggage.other` |

#### Jewelry (`womens_jewelry`)
| Subcategory | `category_path` |
|-------------|----------------|
| Body Jewelry | `womens_jewelry.body_jewelry` |
| Bracelets | `womens_jewelry.bracelets` |
| Brooches | `womens_jewelry.brooches` |
| Charms | `womens_jewelry.charms` |
| Cufflinks | `womens_jewelry.cufflinks` |
| Earrings | `womens_jewelry.earrings` |
| Necklaces | `womens_jewelry.necklaces` |
| Rings | `womens_jewelry.rings` |

---

## Gotchas & Pitfalls

These are verified behaviors from live API testing:

| Gotcha | Detail |
|--------|--------|
| **Draft vs Publish field names differ** | Draft: `make_offer`/`buy_now` (underscores). Publish: `makeoffer`/`buynow` (no underscores). |
| **Draft price = number, Publish price = string** | Draft: `"price": 120`. Publish: `"price": "120"`. |
| **Photos must be objects** | `{url, width, height, rotate, position}` — plain URL strings are rejected. |
| **Designers must be objects** | `[{id, name, slug}]` — plain string arrays are rejected. Look up with `grailed brand`. |
| **Size "one size" has a space** | `"one size"` works. `"one_size"` returns 422 "Size is invalid". |
| **Flat payload, no wrapper** | Send `{title, price, ...}` directly. Wrapping in `{listing_draft: {...}}` causes 422. |
| **Cookies expire frequently** | Cloudflare `__cf_bm`/`cf_clearance` rotate often. Refresh if you get 401. |
| **return_address_id required for publish** | Get via `grailed addresses`. Without it, publish returns 422. |

---

## Architecture

```
tools/grailed/
├── cli.js              CLI entry point (parses args, routes to API, formats output)
├── grailed-api.js      API client module (all fetch calls, presigned S3 upload, Algolia)
├── SKILL.md            OpenClaw agent skill definition
├── README.md           This file
└── examples/
    ├── listing.json    Draft payload template
    └── publish.json    Publish payload template
```

### API Auth Flow

```
Browser session cookies + csrf_token cookie
        ↓
  Cookie header + x-csrf-token header
        ↓
  grailed.com/api/* endpoints
```

### Image Upload (presigned S3)

```
1. GET  /api/photos/presign/listing  → { data: { fields: {...}, image_url } }
2. POST grailed-media.s3.amazonaws.com  → FormData with presigned fields + file
3. Use image_url from step 1 in your listing photos array
```

### API Endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/api/users/me` | Yes | Current user info |
| GET | `/api/users/{id}/postal_addresses` | Yes | Shipping addresses |
| GET | `/api/config/categories` | No | Full category tree |
| POST | Algolia `mnrwefss2q-dsn.algolia.net` | No | Brand search |
| GET | `/api/photos/presign/listing` | Yes | Get presigned S3 URL |
| POST | `/api/listing_drafts` | Yes | Create draft |
| PUT | `/api/listing_drafts/{id}` | Yes | Update draft (accept-version: v1) |
| POST | `/api/listing_drafts/{id}/submit` | Yes | Submit draft → live listing |
| GET | `/api/listing_drafts?page={n}` | Yes | List drafts |
| DELETE | `/api/listing_drafts/{id}` | Yes | Delete draft |
| POST | `/api/listings` | Yes | Direct publish (accept-version: v1) |
| GET | `/api/listings/{id}` | No | Get listing details |
| DELETE | `/api/listings/{id}` | Yes | Delete listing |
| GET | `/api/users/{id}/wardrobe?page={n}&limit={n}` | No | User's listings |
