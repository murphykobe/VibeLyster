# eBay Single-Listing Publish + Maestro CI — Design Spec

## Goal

Enable end-to-end single-listing eBay publish (live + draft) from the VibeLyster app against the eBay sandbox, with clear seller/listing readiness feedback and deterministic Maestro iOS flows running in GitHub PR CI.

---

## Scope

### In V1

- Single-listing eBay publish (live + draft) through the existing `POST /api/publish` endpoint
- Seller readiness detection: fetch existing eBay business policies/setup per connected account
- Listing-level eBay metadata: deterministic category/condition/item-specifics mapping for apparel/fashion
- AI fallback for item-specific eBay fields that cannot be deterministically mapped
- Persist generated eBay metadata in `platform_listings.platform_data`
- Seller readiness snapshot cached on the eBay connection record
- Mobile: eBay appears as a publishable platform on the listing detail screen
- Mobile: eBay-specific metadata section on listing detail (shown when generated or when validation fails)
- Mobile: eBay setup status hint in Settings
- Actionable error/toast for publish failures (seller setup vs listing metadata vs API errors)
- Deterministic Maestro iOS flow added to GitHub PR CI
- OAuth scope expansion beyond identity-only to support publish-related eBay APIs

### Not in V1

- Bulk eBay publish
- eBay delist / status sync parity
- In-app eBay seller settings editor
- Automatic eBay business policy creation
- Non-apparel/non-fashion categories
- Live eBay sandbox Maestro in PR CI (remains local/manual)

---

## Architecture

### Boundaries

**Server**

- eBay OAuth scope expansion for publish APIs
- Seller readiness checks (fetch existing business policies, required account setup)
- Deterministic listing → eBay mapping for apparel/fashion categories
- AI fallback for unmapped item-specific attributes
- Draft/live listing creation against eBay sandbox
- Persist eBay metadata + publish result in `platform_listings.platform_data`
- Cache seller readiness snapshot on the connection record

**Mobile**

- Trigger single-listing eBay publish (live/draft) from listing detail
- Show eBay seller readiness status in Settings
- Show/edit item-specific eBay metadata on listing detail when needed
- Surface actionable publish errors

---

## Data Model

### Existing tables used — no new tables

#### `marketplace_connections` — seller readiness snapshot

The eBay connection's `encrypted_tokens` JSONB payload will include a cached seller readiness snapshot alongside the existing OAuth tokens:

```
{
  // existing OAuth tokens...
  access_token: "...",
  refresh_token: "...",

  // V1 seller readiness snapshot
  seller_readiness: {
    ready: boolean,
    missing: string[],            // e.g. ["fulfillment_policy", "return_policy"]
    policies: {
      payment?: { id, name },
      fulfillment?: { id, name },
      return?: { id, name },
    },
    marketplace_id?: string,
    checked_at: string,           // ISO timestamp
  }
}
```

This is **read-only** in V1 — no in-app editor. Refreshed on publish attempts and visible in Settings.

#### `platform_listings.platform_data` — eBay item metadata

For `platform = 'ebay'`, `platform_data` will store:

```
{
  // publish result state (same pattern as grailed/depop)
  remote_state: "draft" | "live",
  mode_requested: "draft" | "live",
  mode_used: "draft" | "live",

  // eBay-specific item metadata
  ebay_category_id: string,
  ebay_condition_id: number,
  ebay_aspects: Record<string, string[]>,   // item specifics
  ebay_listing_format: string,
  ebay_policies: {
    payment_policy_id: string,
    fulfillment_policy_id: string,
    return_policy_id: string,
  },

  // provenance tracking
  metadata_sources: Record<string, "deterministic" | "ai" | "user">,

  // validation
  validation_status: "valid" | "incomplete",
  missing_fields?: string[],
}
```

---

## Publish Flow

### Step 1: User taps Publish

From listing detail, user selects eBay platform in live or draft mode. Mobile calls `POST /api/publish` with `platforms: ["ebay"]`.

### Step 2: Server loads prerequisites

- Load listing from DB
- Load user's eBay connection + tokens
- Load existing eBay platform listing row if present
- Fetch/check seller readiness from eBay account APIs
- Update cached seller readiness snapshot on connection

### Step 3: Seller readiness validation

If seller setup is incomplete:
- Do not attempt publish
- Return structured error with missing requirements list
- Mobile shows:
  - Publish error/toast with actionable message
  - Settings shows eBay setup status hint

### Step 4: Build eBay item metadata

#### Deterministic mapping (first pass)

Map from generic listing fields:
- `category` → eBay category ID (apparel/fashion mapping table)
- `condition` → eBay condition ID
- `brand`, `size`, `traits` → eBay aspects/item specifics
- `title`, `description`, `price`, `photos` → eBay listing payload fields

#### AI fallback (second pass)

If deterministic mapping leaves required eBay item specifics unfilled:
- Generate missing values from listing context using AI
- Persist generated values into `platform_data`
- Mark provenance as `ai`

### Step 5: Listing metadata validation

Before calling eBay:
- Validate all required eBay fields are present
- Validate mode support (draft/live)

If validation fails:
- Do not publish
- Return structured validation errors listing missing fields
- Mobile shows eBay metadata section on listing for user to review/edit

### Step 6: Remote eBay publish

If validation passes:
- Create or update eBay listing (draft or live) via eBay sandbox API
- Persist result in `platform_listings`:
  - `status`
  - `platform_listing_id`
  - `platform_data` (remote state, metadata, policies used)
  - error/sync metadata

### Step 7: Return result

Return per-platform result as today. Mobile updates listing UI accordingly.

---

## Failure Classes

### Seller setup failure

**Cause**: missing business policies, incomplete seller account setup

**User sees**:
- Publish error/toast: "eBay seller setup incomplete — check Settings"
- Settings: eBay status card shows what is missing

### Listing metadata failure

**Cause**: required eBay item specifics still missing after generation

**User sees**:
- Publish error: "This listing needs more eBay-specific info"
- eBay metadata section revealed on listing detail for review/edit

### Remote eBay API failure

**Cause**: eBay rejects payload, auth scope insufficient, sandbox validation error

**User sees**:
- Publish failed toast
- Last error persisted on platform listing row
- Listing stays editable for retry

---

## Mobile UI

### Listing detail screen

- eBay appears as a publishable platform alongside Grailed/Depop
- publish in live or draft mode
- on publish success: reflect eBay platform row state
- on publish failure: show appropriate error class

### eBay metadata section on listing detail

- Initially hidden
- Auto-populated on first eBay publish attempt
- Shown when:
  - generation happened
  - validation failed
  - user wants to review/edit generated fields
- Displays/edits:
  - eBay category mapping result
  - required item specifics/aspects
  - generated values needing confirmation
- Saves back to listing's eBay platform metadata
- Does not contain seller/account defaults

### Settings screen

- eBay connection row gains a readiness status indicator
- Possible states:
  - Connected and ready
  - Connected but seller setup incomplete (with missing items)
  - Connected, readiness not checked yet
  - Not connected

---

## OAuth Scope Expansion

The current eBay connect flow uses `commerce.identity.readonly` only.

For publish, we will need additional scopes. The exact scopes will be determined during implementation by consulting eBay API docs, but will likely include:
- sell inventory / offer management
- account policy read access

The connect flow must be updated to request these expanded scopes so new connections get publish-capable tokens. Existing connections may need to re-authorize.

---

## Testing

### Server unit/integration tests

- eBay seller readiness fetch/parsing
- Missing policy/setup cases
- Deterministic listing → eBay mapping for all apparel/fashion categories
- AI fallback orchestration for missing item specifics
- eBay draft/live request building
- `POST /api/publish` returning structured eBay errors
- Persistence of eBay metadata + publish result into `platform_listings`

### Local end-to-end verification

- Real eBay sandbox publish smoke path:
  - connect eBay
  - create/load listing in apparel/fashion scope
  - publish to eBay sandbox (live + draft)
- Playwright for browser/server verification first
- Maestro native smoke for listing publish if practical

---

## CI: Deterministic Maestro in GitHub PR CI

### Trigger

Run on PRs only when these paths change:
- `apps/mobile/**`
- `apps/server/**`
- `.github/workflows/**`
- `apps/mobile/.maestro/**`

### Job shape

On macOS runner:
1. Install Node deps
2. Install Maestro CLI
3. Build iOS dev client (or cache the build)
4. Boot iOS simulator
5. Start mock server (`MOCK_MODE=1`) on port 3001
6. Start Expo dev client / Metro on port 8083
7. Run deterministic Maestro flow (`npm run maestro:ebay:deterministic`)
8. Upload Maestro logs/screenshots as artifacts on failure

### What runs

- Deterministic eBay connect deep-link flow only
- Uses mock backend, no real credentials
- No live sandbox flow in PR CI

### What does not run in PR CI

- Live eBay sandbox Maestro flow (remains local/manual or future nightly)

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Publish scope | Single listing only | Prove vertical slice before bulk |
| Draft support | Yes, if eBay API supports it | User requested full live + draft |
| Seller setup | Read-only, fetch existing | Minimal V1, no in-app editor |
| Listing metadata | Deterministic first, AI fallback | Reliable mapping with smart fill |
| Metadata storage | `platform_listings.platform_data` | No new tables |
| Seller readiness | Cached on connection record | No new tables |
| New tables | None | Use existing schema |
| Category scope | Apparel/fashion only | Matches existing VibeLyster scope |
| CI Maestro | Deterministic only, on relevant file changes | Stable, no external auth deps |
| Live Maestro CI | Not in V1 PR CI | Flaky, external auth dependent |
