# VibeLyster MVP Test Plan

Concrete, verifiable tests organised into three tiers: automated unit/integration tests (CI), automated browser tests (Playwright against mock backend), and manual device tests (Expo Dev Client on iOS).

See also:
- `docs/testing-guide.md` for the current testing strategy, verification status, backend modes, and publish API behavior

---

## Tier 1 — Automated Unit & Integration Tests (Vitest)

Run: `cd apps/server && npm test`

### 1A. Marketplace Adapter Contract Tests (DONE — 50 tests)

Files: `apps/server/lib/marketplace/__tests__/{grailed,depop}.test.ts`

| # | Test | Verify |
|---|------|--------|
| 1 | `mapCategory(null)` returns platform default | Grailed: `tops.t_shirts`, Depop: `{clothing, t-shirts}` |
| 2 | `mapCategory("unknown")` returns default | Same as above |
| 3 | `mapCategory` maps all known keys | 20 keys for Grailed, 18 for Depop |
| 4 | `mapCategory` substring match (case-insensitive) | `"Vintage T-Shirt"` -> t_shirts |
| 5 | `mapCondition(null)` returns safe default | Grailed: `is_gently_used`, Depop: `excellent_condition` |
| 6 | `mapCondition` maps all variants | new/brand_new/nwt, gently_used, used, heavily_used |
| 7 | `mapCondition` normalises spaces | `"gently used"` -> `gently_used` |
| 8 | `publish*` network failure -> `retryable: true` | `fetch` rejects with Error |
| 9 | `publish*` 4xx (non-429) -> `retryable: false` | 403/401 response |
| 10 | `publish*` 5xx -> `retryable: true` | 500 response |
| 11 | `publish*` 429 -> `retryable: true` | Rate limit response |
| 12 | `publish*` success -> correct payload shape | `platformListingId`, mapped fields |
| 13 | Photo slice enforced | Grailed: max 8, Depop: max 4 |
| 14 | `delist*` success | `ok: true` |
| 15 | `delist*` 4xx -> `retryable: false` | 404 response |
| 16 | `delist*` 5xx -> `retryable: true` | 500 response |
| 17 | `checkStatus` live/sold/delisted | Status mapping |

### 1B. API Route Integration Tests (DONE — 43 tests)

File: `apps/server/app/api/__tests__/routes.test.ts`

Uses `MOCK_MODE=1` so tests hit real Next.js route handlers with the in-memory mock DB — no Neon, Clerk, or external APIs required.

| # | Test | Method | Endpoint | Verify |
|---|------|--------|----------|--------|
| 1 | Create listing | POST | `/api/listings` | 201, returns `id`, stored in mock DB |
| 2 | List listings (empty) | GET | `/api/listings` | 200, `[]` |
| 3 | List listings (with data) | GET | `/api/listings` | 200, returns created listings |
| 4 | Get listing by ID | GET | `/api/listings/[id]` | 200, matches created data |
| 5 | Get listing 404 | GET | `/api/listings/[id]` | 404 for non-existent ID |
| 6 | Update listing | PUT | `/api/listings/[id]` | 200, fields updated |
| 7 | Update listing — partial | PUT | `/api/listings/[id]` | Only provided fields change |
| 8 | Delete listing (soft) | DELETE | `/api/listings/[id]` | 200, subsequent GET returns 404 |
| 9 | Connect marketplace | POST | `/api/connect` | 200, body: `{platform, tokens}` |
| 10 | List connections | GET | `/api/connections` | Returns connected platforms |
| 11 | Disconnect marketplace | DELETE | `/api/connect?platform=grailed` | 200, removed from list |
| 12 | Publish (mock) | POST | `/api/publish` | 200, `platform_listing_id` returned |
| 13 | Publish without connection | POST | `/api/publish` | 400, `"not connected"` |
| 14 | Bulk publish (mock) | POST | `/api/publish/bulk` | 202, async processing |
| 15 | Delist (mock) | POST | `/api/delist` | 200, status -> `delisted` |
| 16 | Status check (mock) | GET | `/api/status/[id]` | 200, returns `live`/`sold` |
| 17 | Zod validation — missing title | POST | `/api/listings` | 400, `details` array |
| 18 | Zod validation — bad platform | POST | `/api/publish` | 400, invalid platform |
| 19 | Zod validation — price < 0 | POST | `/api/listings` | 400, price validation |
| 20 | Publish draft mode | POST | `/api/publish` | Stores remote draft metadata without marking listing live |
| 21 | Delist after publish | POST | `/api/delist` | Status moves to `delisted` |
| 22 | Delete after delist | DELETE | `/api/listings/[id]` | Allowed once all platforms are delisted |
| 23 | Upload route accepts HEIF/JPG aliases | POST | `/api/upload` | Supported image types normalize correctly |
| 24 | Upload route rejects unsupported image types | POST | `/api/upload` | 400 validation error |

### 1C. Crypto Round-Trip Tests (DONE — 5 tests)

File: `apps/server/lib/__tests__/crypto.test.ts`

| # | Test | Verify |
|---|------|--------|
| 1 | Encrypt then decrypt returns original | JSON tokens survive round-trip |
| 2 | Different plaintexts produce different ciphertexts | Non-deterministic (IV) |
| 3 | Encrypted envelope shape | Includes `iv`, `data`, and `tag` fields with expected lengths |
| 4 | Tampered ciphertext throws | Modified bytes -> decryption error |
| 5 | Tampered auth tag throws | Auth failure on modified tag |

### 1D. Supporting Unit Tests (DONE — 12 tests)

Files:
- `apps/server/lib/__tests__/categories.test.ts`
- `apps/server/scripts/__tests__/live-publish-smoke-helpers.test.ts`

These cover canonical category normalization/mapping and draft-safe helper payload generation used by the live publish smoke tooling.

---

## Tier 2 — Automated Browser Tests (Playwright against Mock Backend)

These test the **mobile app running in Expo Web mode** against the **mock backend**. No device, no Clerk, no marketplace APIs. Validates the full UI flow end-to-end via HTTP.

### Setup

```bash
# Terminal 1: mock backend
cd apps/server && npm run dev:mock

# Terminal 2: expo web
cd apps/mobile && EXPO_PUBLIC_MOCK_MODE=1 EXPO_PUBLIC_API_URL=http://localhost:3001 npx expo start --web

# Terminal 3: playwright
npx playwright test
```

Config: `apps/mobile/playwright.config.ts` (baseURL: `http://localhost:8081`)

### 2A. Dashboard Flow

| # | Step | Action | Expected |
|---|------|--------|----------|
| 1 | Load dashboard | Navigate to `/` | Empty state: "No listings yet" message visible |
| 2 | Navigate to capture | Tap "+" FAB or capture tab | Capture screen loads |
| 3 | Return to dashboard | Back navigation | Dashboard renders without error |

### 2B. Listing CRUD Flow

| # | Step | Action | Expected |
|---|------|--------|----------|
| 1 | Create via API | `POST /api/listings` with mock data | 201 |
| 2 | Dashboard shows listing | Reload dashboard | ListingCard visible with title |
| 3 | Open detail | Click listing card | `/listing/[id]` loads, title/price/photos match |
| 4 | Edit title | Change title field, save | Title updated on reload |
| 5 | Edit price | Change to `$150`, save | Price shows `$150` on detail screen |
| 6 | Delete listing | Delete from detail, confirm | Redirects to dashboard, card gone |

### 2C. Marketplace Connection Flow

| # | Step | Action | Expected |
|---|------|--------|----------|
| 1 | Open settings | Navigate to settings tab | Settings screen loads |
| 2 | Grailed shows "Connect" | No prior connection | Button text: "Connect" |
| 3 | Depop shows "Connect" | No prior connection | Button text: "Connect" |
| 4 | Connect Grailed (mock) | Seed via `POST /api/connect {platform: "grailed", tokens: {...}}` | Settings shows "Connected" for Grailed |
| 5 | Disconnect Grailed | Tap disconnect | Status reverts to "Connect" |

### 2D. Publish / Delist Flow

| # | Step | Action | Expected |
|---|------|--------|----------|
| 1 | Pre-seed | Create listing + connect grailed via API | Both exist in mock DB |
| 2 | Open listing detail | Navigate to `/listing/[id]` | Grailed row shows "Publish" button |
| 3 | Publish to Grailed | Tap "Publish" on Grailed row | Status changes to "Live", button changes to "Delist" |
| 4 | Verify dashboard badge | Go to dashboard | Listing card shows "live" badge |
| 5 | Delist from Grailed | Return to detail, tap "Delist" | Status reverts, button changes to "Publish" |

### 2E. Bulk Publish Flow

| # | Step | Action | Expected |
|---|------|--------|----------|
| 1 | Pre-seed | Create 3 listings + connect grailed + depop | All in mock DB |
| 2 | Select all | Dashboard: tap select, select all 3 | 3 listings highlighted |
| 3 | Bulk publish | Tap "Publish Selected" | Toast/alert confirms. All 3 show "live" on refresh |
| 4 | Verify per-platform | Open any listing detail | Both Grailed and Depop rows show "Live" |

---

## Tier 3 — Manual Device Tests (Expo Dev Client on iOS Simulator / Device)

These require a running iOS simulator or physical device. They test native-only functionality that cannot be verified in Expo Web.

### Prerequisites

```bash
# Start mock backend (LAN mode for device testing)
cd apps/server && npm run dev:mock:lan

# Start Expo dev client
cd apps/mobile && EXPO_PUBLIC_MOCK_MODE=1 EXPO_PUBLIC_API_URL=http://<LAN_IP>:3001 npx expo start
```

### 3A. Camera & Photo Picker (Native Only)

| # | Step | Action | Expected | Pass? |
|---|------|--------|----------|-------|
| 1 | Open capture | Tap capture tab | Camera/photo picker UI loads | |
| 2 | Pick photos | Select 1-3 photos from library | Thumbnails appear in capture screen | |
| 3 | Pick 8+ photos | Select 9 photos | Only 8 appear (capped) | |
| 4 | Remove photo | Tap X on a thumbnail | Photo removed, count decrements | |
| 5 | Reorder photos | Drag to reorder (if supported) | Order persists to listing | |

### 3B. Voice Recording (Native Only)

| # | Step | Action | Expected | Pass? |
|---|------|--------|----------|-------|
| 1 | Start recording | Hold record button | Visual feedback (waveform/pulse) | |
| 2 | Stop recording | Release button | Recording stops, duration shown | |
| 3 | Playback | Tap play on recorded clip | Audio plays back | |
| 4 | Re-record | Record again | Previous recording replaced | |
| 5 | Generate with voice | Photos + voice, tap Generate | Draft created with AI-generated fields | |
| 6 | Generate with transcript override | Submit photo(s) + manual transcript (no audio) to `/api/generate` | Draft created; transcript is used directly, skipping STT | |

### 3C. WebView Marketplace Auth (Native Only)

| # | Step | Action | Expected | Pass? |
|---|------|--------|----------|-------|
| 1 | Open Grailed connect | Settings -> Grailed -> Connect | WebView loads `grailed.com/users/sign_in` | |
| 2 | Grailed login | Enter credentials, submit | Login detector fires, WebView closes | |
| 3 | Grailed token capture | After login | `CookieManager.get()` captures cookies (incl. HttpOnly) | |
| 4 | Grailed connected | Return to settings | Grailed row shows "Connected" | |
| 5 | Open Depop connect | Settings -> Depop -> Connect | WebView loads `depop.com/login` | |
| 6 | Depop magic link | Enter email, check for link | Redirect URL intercepted for Bearer token | |
| 7 | Depop connected | After token capture | Depop row shows "Connected" | |
| 8 | Disconnect Grailed | Tap "Disconnect" | Row reverts, server DELETE /api/connect succeeds | |

### 3D. Full Happy Path (Native, End-to-End)

| # | Step | Action | Expected | Pass? |
|---|------|--------|----------|-------|
| 1 | Fresh start | Kill app, restart with empty mock DB | Dashboard shows empty state | |
| 2 | Connect Grailed | Settings -> Connect -> Login | Connected | |
| 3 | Capture listing | Photos (2) + voice note ("Nike Air Force 1, size 10, new, 120 bucks") | Capture screen ready | |
| 4 | Generate | Tap Generate | Spinner, then navigates to draft detail | |
| 5 | Verify AI fields | Check detail screen | Title, description, price ($120), size (10), condition (New), brand (Nike) populated | |
| 6 | Edit price | Change to $130 | Saves on blur/submit | |
| 7 | Publish to Grailed | Tap Publish on Grailed row | Status -> "Live" | |
| 8 | Dashboard check | Navigate to dashboard | Card shows "live" badge | |
| 9 | Status sync | Detail -> pull to refresh or tap sync | Status still "live" | |
| 10 | Delist | Detail -> Delist from Grailed | Status -> draft (no platform rows "live") | |
| 11 | Re-publish both | Tap "Publish to All" | Both Grailed + Depop show "Live" (if Depop connected) | |
| 12 | Verify persistence | Kill + relaunch app | Listings still present | |

### 3E. Edge Cases & Error States (Native)

| # | Scenario | Action | Expected | Pass? |
|---|----------|--------|----------|-------|
| 1 | No photos | Try to generate with only voice | Error: "Add at least one photo" | |
| 2 | No voice | Generate with photos only | AI uses vision-only path, still generates | |
| 3 | Publish without connection | Open listing, tap Publish on unconnected platform | Error or prompt to connect | |
| 4 | Network offline | Disable network, try to publish | Error toast: network/retry message | |
| 5 | Token expired | Connect, wait for expiry (or tamper), publish | Error: "Session expired, reconnect" | |
| 6 | Transcript-only generate | POST `/api/generate` with `transcript` + optional `photos`, no audio | Draft created without calling STT | |
| 7 | Duplicate publish | Publish same listing to same platform twice | Idempotent: same `platform_listing_id` returned | |
| 8 | Large description | Generate listing with very long voice note or transcript | Description truncated to platform max | |
| 9 | Special characters | Title/transcript with emojis, unicode, quotes | Renders correctly, posts without error | |

---

## Test Results Tracking

### Summary

| Tier | Scope | Count | Status |
|------|-------|-------|--------|
| 1A | Marketplace adapter contracts | 50 | **PASS** |
| 1B | API route integration | 43 | **PASS** |
| 1C | Crypto round-trip | 5 | **PASS** |
| 1D | Supporting unit tests | 12 | **PASS** |
| 2A-E | Browser E2E (Playwright, mock backend) | 23 planned scenarios | Not re-verified in this document |
| 3A-E | Manual device tests | 40 planned scenarios | TODO |
| **Verified automated server total** | | **110** | **PASS** |

### Automation Priority

1. **2D / 2E (Publish/Delist + Bulk Publish browser flows)** — Highest remaining automated value for the money path outside server-only tests.
2. **3C (WebView auth)** — Native-only and still the biggest product risk for real marketplace connections.
3. **3A / 3B (Camera, picker, voice recording)** — Native capture remains lightly verified compared with server behavior.
4. **3D (Full happy path)** — Manual release gate for end-to-end confidence on iOS.
5. **3E (Error states)** — Important for reconnect, offline, and duplicate-publish handling once native happy paths are stable.

### Deferred live eBay production smoke

If we add a true live eBay production smoke later, it should be:
- a dedicated `workflow_dispatch` workflow
- secrets-gated
- configured with explicit production eBay credentials, not sandbox credentials
- non-blocking and excluded from normal PR CI
