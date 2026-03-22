# POC: Grailed CLI Tool

## Goal

Validate that Grailed's internal API can be called programmatically with session credentials. This is the core technical risk for VibeLyster — if this works, the full product is feasible.

## What We're Proving

1. Grailed's REST API endpoints work as mapped from Crosslist extension reverse engineering
2. Session cookie + CSRF token authentication works outside the browser
3. Full listing CRUD (create, read, update, delete) works programmatically
4. Image upload via presigned S3 URLs works
5. An AI agent (via OpenClaw) can drive the workflow end-to-end

## Implementation

### Grailed API Client (`grailed-api.js`)

A Node.js module wrapping Grailed's internal REST API:

- `checkLogin(csrfToken, cookies)` — verify auth is working
- `getCategories()` — list all categories (public, no auth)
- `searchBrand(query, department)` — Algolia brand search (public)
- `uploadImage(imagePath, csrfToken, cookies)` — 2-step presigned S3 upload
- `createListing(data, csrfToken, cookies)` — POST /api/listings
- `updateListing(id, data, csrfToken, cookies)` — PUT /api/listings/{id}
- `deleteListing(id, csrfToken, cookies)` — DELETE /api/listings/{id}
- `getListing(id)` — GET /api/listings/{id} (public)
- `getWardrobe(userId, page, limit, cookies)` — list user's listings
- `getAddresses(userId, csrfToken, cookies)` — list shipping addresses

### CLI Tool (`cli.js`)

Command-line interface for manual testing:

```bash
# Public commands (no auth needed)
grailed categories                        # List all categories
grailed brand "Comme des Garcons"         # Search brands via Algolia
grailed listing 123456                    # View any listing (public)

# Authenticated commands
export GRAILED_CSRF_TOKEN="..."
export GRAILED_COOKIES="..."
grailed auth                              # Check login status
grailed wardrobe                          # List your items
grailed addresses                         # Your shipping addresses
grailed upload ./photo.jpg                # Upload image, get URL
grailed create listing.json               # Create a listing
grailed delete 12345678                   # Delete a listing
```

### OpenClaw Skill (`SKILL.md`)

Packages the CLI as an OpenClaw agent skill, so an AI agent can:
1. Use OpenClaw's browser tool to grab Grailed session cookies
2. Call the CLI to create/manage listings
3. Enable voice-driven listing creation via chat

### Getting Auth Tokens

**Option A: Manual (for initial testing)**
1. Log into grailed.com in Chrome
2. Open DevTools → Application → Cookies
3. Copy `csrf_token` cookie value → `GRAILED_CSRF_TOKEN`
4. Copy all cookies as string → `GRAILED_COOKIES`

**Option B: OpenClaw Browser Tool (for agent workflow)**
1. OpenClaw's browser tool in `user` profile mode attaches to your logged-in browser
2. Agent reads cookies via `openclaw browser cookies`
3. Extracts `csrf_token` and session cookies programmatically

## Test Plan

### Phase 1: Public API Verification (no auth)
- [ ] `grailed categories` returns full category tree
- [ ] `grailed brand "Nike"` returns brand ID and details
- [ ] `grailed listing <known-id>` returns complete listing data

### Phase 2: Auth Verification
- [ ] `grailed auth` successfully identifies logged-in user
- [ ] `grailed wardrobe` lists user's current items
- [ ] `grailed addresses` returns shipping addresses

### Phase 3: Write Operations (the real test)
- [ ] `grailed upload <image>` successfully uploads to S3, returns valid URL
- [ ] `grailed create <listing.json>` creates a real listing on Grailed
- [ ] Verify the listing appears on grailed.com
- [ ] `grailed delete <id>` removes the listing
- [ ] Verify the listing is gone

### Phase 4: OpenClaw Agent Integration
- [ ] OpenClaw browser tool can extract Grailed cookies
- [ ] Agent can use grailed skill to create a listing from natural language
- [ ] End-to-end: voice command → agent → grailed API → live listing

## Listing JSON Example

Based on the data model from `/api/listings/{id}`:

```json
{
  "title": "Comme des Garcons Play Heart Logo Tee",
  "description": "CDG Play classic heart logo t-shirt. Size Large. Excellent condition, 9/10. No stains, no damage. Worn a handful of times.",
  "price": 85,
  "category_path": "tops.short_sleeve_shirts",
  "department": "menswear",
  "designers": [{ "id": 230, "name": "Comme des Garcons" }],
  "condition": "is_gently_used",
  "size": "l",
  "make_offer": true,
  "photos": ["<uploaded-image-url>"],
  "traits": [
    { "name": "color", "value": "white" }
  ],
  "shipping": {
    "us": { "amount": 10, "enabled": true }
  }
}
```

Note: The exact POST body format may need adjustment based on what the API actually accepts. The listing data model above is from GET responses — the create endpoint may expect a slightly different structure. Part of the POC is discovering the exact create payload format.

## Files

```
tools/grailed/
  ├── package.json          # Node.js package
  ├── grailed-api.js        # API client module
  ├── cli.js                # CLI entry point
  └── examples/
      └── listing.json      # Example listing payload
```

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Create listing payload format differs from GET response | Medium | Start with GET response structure, iterate based on error messages |
| CSRF token expires quickly | Low | Test token lifetime, implement refresh logic if needed |
| Grailed blocks non-browser requests (User-Agent, etc.) | Medium | Add browser-like headers, spoof Origin/Referer (same as Crosslist does) |
| S3 presigned URL has short TTL | Low | Upload immediately after presigning |
