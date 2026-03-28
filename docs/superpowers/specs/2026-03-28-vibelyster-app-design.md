# VibeLyster App Design Spec

> Supersedes the original PRD architecture (Chrome extension + PWA).
> Updated 2026-03-28 based on SellRaze competitive analysis and POC learnings.

## Overview

VibeLyster is an AI-powered reselling automation app. Users take photos and record a voice description on their phone. AI transcribes the voice, analyzes images when needed, and generates optimized listings for Grailed, eBay, and Depop. Users review drafts, edit if needed, and publish to marketplaces — all from the app.

## What Changed from the Original PRD

| Decision | Original PRD | Updated |
|---|---|---|
| Client | Mobile PWA | React Native / Expo (iOS only) |
| Posting mechanism | Chrome extension posts to marketplaces | Server-side (client-side fallback) |
| Marketplace auth | Extension reads browser cookies | In-app WebView login (token capture) |
| Backend | Unspecified | Next.js API routes on Vercel |
| Database | Unspecified | Neon Postgres (Vercel Marketplace) |
| App auth | Unspecified | Clerk (Apple + Google Sign in) |
| AI pipeline | Single AI agent call | Whisper transcription → vision model (structured output) |
| Core UX | Linear capture flow | Dashboard home → draft-first workflow |

**Why:** SellRaze (YC F25, 200K+ users) proved the in-app WebView login pattern works for all platforms. No browser extension needed. The Depop CLI POC proved magic link token capture works. The Grailed CLI POC proved direct API posting works with session cookies.

## Target Platforms (MVP)

| Platform | Posting Method | Auth Method | MVP? |
|---|---|---|---|
| Grailed | Server-side (client-side fallback) | WebView login → CSRF token + session cookies | Yes |
| Depop | Server-side with impit TLS bypass (client-side fallback) | WebView magic link → Bearer access_token | Yes |
| eBay | Server-side (official API) | OAuth 2.0 consent screen in WebView | Post-MVP |

**eBay deferred to post-MVP.** eBay requires business policy setup (shipping, returns, payment) and category-specific item aspects — significantly more complex than Grailed/Depop. Will be added as a Settings-based one-time policy configuration after Grailed + Depop are stable.

**Server vs client posting:** Start server-side for all platforms. If Grailed/Depop have issues with server-side token relay (datacenter IP blocking, Cloudflare, TLS fingerprinting), fall back to client-side posting from the app. eBay is always server-side via official OAuth.

**Client-side fallback strategy:** The React Native app cannot run `impit` (native Rust binary, Node.js only). Instead, the client-side fallback for Depop and Grailed uses **WebView-mediated API calls**: the app injects fetch requests into an authenticated WebView context (which already has the correct TLS fingerprint, cookies, and anti-bot tokens). This is the same technique SellRaze uses — the WebView acts as a browser proxy for API calls. The posting module has two implementations: a server-side version (Node.js, uses impit for Depop) and a client-side version (WebView injection).

## Tech Stack

| Layer | Technology |
|---|---|
| iOS App | React Native / Expo |
| Backend | Next.js (App Router) on Vercel |
| Database | Neon Postgres (Vercel Marketplace) |
| App Auth | Clerk (Apple + Google Sign in) |
| AI | Vercel AI Gateway (Whisper + vision model) |
| Photo storage | Vercel Blob (up to 5TB, client uploads) |
| Marketplace posting | Shared TypeScript module (ported from CLI POCs) |
| TLS bypass (Depop) | impit (Rust-based Chrome TLS mimic) |

## User Flow

### 1. Onboarding (first launch)

1. User opens app → Sign in with Apple or Google (via Clerk)
2. Lands on dashboard immediately — no marketplace connection required
3. Marketplace connections happen later, from Settings or when first publishing

### 2. Dashboard (home screen)

- Header: app name, settings gear icon
- Filter tabs: All / Drafts / Live / Sold
- Listing cards showing: thumbnail, title, price, per-platform status dots (green = live, grey = not published)
- Prominent "+" floating action button to create new listing

### 3. Capture Flow (tap "+")

1. Camera button — take photos or select from camera roll (multiple photos supported)
2. Mic button — hold to record voice note describing the item
3. "Generate Draft" button — uploads photos + audio to server
4. Loading state while AI processes

### 4. AI Processing Pipeline

1. **Voice → Text**: Whisper transcription via AI Gateway
2. **Completeness check**: Does the transcript contain enough info (brand, size, condition, price)?
   - If complete: text-only model call (cheaper, faster — no vision needed)
   - If incomplete: text + images sent to vision model
3. **Structured output**: Single model call returns typed JSON with all fields for all platforms:
   - Title (per-platform optimized)
   - Description (per-platform optimized)
   - Price
   - Size
   - Condition
   - Brand
   - Category (per-platform mapped)
   - Traits/attributes

**Model selection:** Use a vision-capable model (Claude Sonnet 4.6 or GPT-5.4) via AI Gateway with structured output (JSON schema). AI Gateway provides failover, cost tracking, and provider-agnostic routing.

### 5. Draft Review

After AI generates the listing, it becomes a **draft** in the app. The user sees:

- After generation: two action buttons side by side:
  - **"+ New Listing"** — jump straight to capture for the next item (batch drafting mode)
  - **"Review & Edit"** — open the draft detail screen
- Confirmation: "Draft saved · You can publish later from dashboard"

**Batch drafting flow:** Capture → Generate → Draft saved → tap "+ New Listing" → Capture next → ... → when done, go to dashboard to review and bulk publish.

### 6. Draft Detail / Listing Detail Screen

This is the central management screen for any listing. Shows:

- Photo carousel at top
- Editable fields (tap to edit): title, price, size, condition, brand, category, description
- **Advanced fields** (expandable section): traits/attributes (color, material), per-platform category overrides. Collapsed by default — most users won't need to touch these, but they're available when AI gets category or traits wrong.
- **Per-platform publish section:**
  - Each marketplace row shows: platform name, connection status, action button
  - Connected + not published: **"Publish"** button
  - Connected + live: **"Delist"** button (red outline)
  - Not connected: **"Connect →"** button (opens WebView auth)
- **"Publish to All Connected"** button at bottom

### 7. Delist / Delete

- **Delist from one platform:** tap "Delist" on that platform's row → confirmation dialog → listing stays live on other platforms, reverts to "Delisted" status on that platform with "Re-publish" option
- **Delist from All:** button below platform rows → confirmation listing all platforms being removed
- **After delisting:** listing reverts to Draft status in VibeLyster. Can re-publish anytime.
- **Delete from VibeLyster:** separate destructive action at bottom of listing detail. If listing is live on any platform, user must delist from all platforms first before delete is allowed. Delete button is disabled with hint text "Delist from all platforms before deleting" when any platform is live.

### 8. Bulk Publish from Dashboard

- Enter selection mode (long-press or "Select" button)
- Checkboxes appear on each draft
- "Select All" option for all drafts
- Bottom action bar shows:
  - Connected platform toggles (pick which platforms to publish to)
  - **"Publish N → Platform1 + Platform2"** button
- Publishes all selected drafts to all toggled platforms

### 9. Marketplace Status Sync

- **Dashboard view:** reads from local database (fast, no API calls)
- **Listing detail view:** on open, fires live status check against marketplace APIs for that specific listing. Updates DB with fresh status.
- **"Last synced"** indicator on listing detail with manual refresh button
- No background cron sync for MVP. User sees fresh data when they look at a specific listing.

### 10. Settings

- **Account:** Clerk profile, sign out
- **Marketplaces:** list of platforms with connection status
  - Connected: shows username, "Disconnect" button
  - Not connected: "Connect" button → opens WebView login flow
- Marketplace connections can also be triggered inline from the draft detail screen when trying to publish

## Marketplace Auth Flows (WebView)

### Grailed
1. Open WebView to `grailed.com/users/sign_in`
2. User logs in normally
3. After successful login, extract `csrf_token` cookie + full cookie string from WebView
4. Store encrypted in database (via server API)

### Depop
1. Trigger Depop's magic link flow — user enters email
2. Depop sends magic link email
3. User taps link (or pastes URL) — app intercepts the redirect
4. Extract `access_token` from the redirect URL
5. Store encrypted in database (via server API)

### eBay
1. Open WebView to eBay OAuth consent URL
2. User authorizes VibeLyster
3. Server receives OAuth callback with authorization code
4. Exchange for access_token + refresh_token (18-month lifetime)
5. Store encrypted in database

## Architecture

```
┌─────────────────────────┐
│     iOS App (Expo)      │
│                         │
│  • Capture (camera +    │
│    voice recording)     │
│  • Draft review/edit    │
│  • Publish controls     │
│  • WebView auth         │
│  • Clerk auth           │
│  • (Fallback: direct    │
│    marketplace API      │
│    calls if server-     │
│    side relay fails)    │
└───────────┬─────────────┘
            │ HTTPS
            ▼
┌─────────────────────────┐
│   Next.js on Vercel     │
│                         │
│  API Routes:            │
│  POST /api/generate     │  AI pipeline (Whisper + vision)
│  GET/POST/PUT/DELETE    │
│    /api/listings/*      │  Draft/listing CRUD
│  POST /api/publish      │  Post to marketplace APIs
│  POST /api/delist       │  Remove from marketplace APIs
│  GET  /api/status/:id   │  Live status check
│  POST /api/connect      │  Store marketplace tokens
│  GET  /api/connections  │  List connected platforms
│                         │
│  AI Gateway:            │
│  • Whisper (voice→text) │
│  • Vision model         │
│    (structured output)  │
└───────────┬─────────────┘
            │
       ┌────┴────┐
       ▼         ▼
┌──────────┐ ┌────────────────┐
│   Neon   │ │  Marketplace   │
│ Postgres │ │  APIs          │
│          │ │                │
│ • users  │ │ • Grailed REST │
│ • market │ │ • Depop REST   │
│   place_ │ │ (eBay: post-   │
│   connect│ │                │
│   ions   │ └────────────────┘
│ • list-  │
│   ings   │
│ • plat-  │
│   form_  │
│   list-  │
│   ings   │
└──────────┘
```

## Database Schema

### users
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| clerk_id | text | Unique, from Clerk |
| email | text | From Clerk profile |
| created_at | timestamp | |

### marketplace_connections
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| user_id | uuid | FK → users |
| platform | text | 'grailed' / 'depop' / 'ebay' |
| encrypted_tokens | jsonb | Encrypted token blob (CSRF, cookies, Bearer, OAuth) |
| platform_username | text | Display name on that platform |
| connected_at | timestamp | |
| expires_at | timestamp | Nullable, for tokens with known expiry |

Unique constraint on (user_id, platform).

### listings
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| user_id | uuid | FK → users |
| title | text | AI-generated, user-editable |
| description | text | AI-generated, user-editable |
| price | numeric | |
| size | text | |
| condition | text | e.g. 'is_gently_used' |
| brand | text | |
| category | text | |
| photos | jsonb | Array of Vercel Blob URLs |
| voice_transcript | text | Raw Whisper output |
| ai_raw_response | jsonb | Full AI response for debugging |
| status | text | 'deleted' only. For active listings, display status is derived at read time from platform_listings: 'draft' (no platform live/publishing), 'live' (any platform live), 'partially_live' (some live, some failed), 'sold' (any platform sold). Not stored — computed via SQL view or application logic. |
| created_at | timestamp | |
| updated_at | timestamp | |

### platform_listings
| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key |
| listing_id | uuid | FK → listings |
| platform | text | 'grailed' / 'depop' / 'ebay' |
| platform_listing_id | text | ID on the marketplace |
| platform_data | jsonb | Platform-specific fields (title, description, category per platform) |
| status | text | 'pending' / 'publishing' / 'live' / 'failed' / 'sold' / 'delisted' |
| last_error | text | Nullable, error message from last failed attempt |
| attempt_count | integer | Default 0, incremented on each publish attempt |
| idempotency_key | text | Unique key to prevent duplicate listings on retry |
| published_at | timestamp | |
| delisted_at | timestamp | |
| last_synced_at | timestamp | Last time we checked marketplace status |

Unique constraint on (listing_id, platform). Unique constraint on (idempotency_key).

## Cost Estimate (MVP)

| Item | Cost |
|---|---|
| Vercel (Hobby plan) | Free |
| Neon Postgres (free tier) | Free |
| Clerk (free tier, 10K MAUs) | Free |
| AI Gateway | No markup (pass-through) |
| Whisper transcription | ~$0.003 per voice note (30 sec) |
| Vision model call | ~$0.03-0.08 per listing (with images) |
| Text-only model call | ~$0.005-0.01 per listing (when voice is sufficient) |
| Apple Developer Program | $99/year |
| Expo EAS Build (free tier) | Free (30 builds/month) |

**At 100 listings/day:** ~$3-8/day for AI costs. Everything else free tier.

## Out of Scope (MVP)

- Inventory sync (auto-delist when sold on another platform)
- Sales tracking and analytics beyond basic counts
- Pricing optimization / market analysis
- Offer management
- Shipping label generation
- Bulk import of existing listings
- Android app
- Background cron sync of marketplace statuses
- Push notifications
- Per-platform description customization in review (single description for MVP, platform optimization in AI generation)
- eBay integration (requires business policy setup, category-specific item aspects — added after Grailed + Depop are stable)

## Success Metrics

- User can create a draft from photos + voice in under 30 seconds of active time
- User can publish a draft to 3 platforms in under 10 seconds
- AI-generated listings are accurate enough that user approves without editing >80% of the time
- Batch workflow: 10 items drafted and published in under 10 minutes

## Technical Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Server-side marketplace token relay blocked (IP/TLS) | High | Shared posting module works both server-side and client-side. Test early. Fall back to client-side posting. |
| Grailed Cloudflare cookies expire frequently (~30 min) | Medium | Prompt user to re-authenticate when API calls fail. WebView re-auth is fast. |
| Depop TLS fingerprinting blocks server calls | Medium | impit bypass already proven in CLI. If server fails, client-side WebView-mediated API calls as fallback. |
| impit native binary doesn't run in Vercel Functions | Medium | Fall back to client-side WebView-mediated posting for Depop. |
| AI misidentifies item attributes | Medium | Always show draft for human review before posting. Voice completeness check reduces reliance on vision. |
| Platform TOS violation | Medium | App operates with user's own credentials, same approach as SellRaze (YC-backed), Crosslist, Flyp, Vendoo. Industry standard. |
| React Native WebView token extraction complexity | Medium | Proven pattern — SellRaze does exactly this. react-native-webview supports cookie/redirect interception. |
