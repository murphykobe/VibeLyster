# VibeLyster — Product Requirements Document (Archived Original Concept)

> Status: historical reference only.
> The current source of truth for MVP scope, architecture, and platform support is [docs/superpowers/specs/2026-03-28-vibelyster-app-design.md](docs/superpowers/specs/2026-03-28-vibelyster-app-design.md).
> This PRD preserves the original Chrome extension + PWA concept and intentionally differs from the current implementation plan.
> Current MVP direction: Expo iOS app, Grailed + Depop in scope, eBay deferred to post-MVP.

## Overview

VibeLyster is an AI-powered reselling automation app. Users provide photos and a voice description of items they want to sell. An AI agent transcribes the voice, analyzes images, infers item attributes, and generates optimized marketplace listings. The system then cross-posts to multiple reselling platforms — freeing the user from typing anything.

## Problem

Resellers spend significant time manually creating listings on each marketplace: writing titles, descriptions, selecting categories, uploading photos, setting prices — then repeating the process for every platform they sell on. Cross-listing tools like Flyp, Vendoo, and Crosslist reduce copy-paste work, but still require manual data entry for the initial listing.

## Solution

An end-to-end automated workflow:

1. **Capture** — User takes photos and records a voice note describing the item
2. **AI Processing** — Server transcribes voice, analyzes images, infers all item attributes (brand, category, size, condition, color), generates platform-optimized listings
3. **Review** — User reviews AI-generated drafts on mobile, approves or edits
4. **Execute** — System posts approved listings to all target marketplaces

The hard part (understanding the item and generating accurate listing content) is done by AI. The cheap part (posting to each platform's API) is automated by a Chrome extension.

## Target User

Individual resellers who sell clothing, streetwear, sneakers, and fashion items across multiple online marketplaces. Currently managing listings manually or with semi-automated cross-listing tools.

## Target Platforms (MVP)

| Platform | Integration Method | Priority |
|----------|-------------------|----------|
| **Grailed** | Chrome extension → internal REST API | Primary |
| **eBay** | Server-side via official OAuth API | Secondary |
| **Depop** | Chrome extension → internal REST API | Tertiary |

## MVP Scope

### In Scope

- Photo capture and upload (mobile)
- Voice note recording and upload (mobile)
- AI-powered listing generation:
  - Voice transcription
  - Image analysis (brand, item type, condition, color, details)
  - Category inference
  - Title and description generation optimized per platform
  - Price suggestion (based on voice input + market context)
- Draft review and editing (mobile web app)
- Automated posting to Grailed, eBay, Depop
- Chrome extension for Grailed/Depop posting

### Out of Scope (MVP)

- Inventory sync (auto-delist when sold on another platform)
- Sales tracking and analytics
- Pricing optimization / market analysis
- Offer management
- Shipping label generation
- Bulk import of existing listings
- Desktop app

## User Flow

```
[Mobile — Active]
  1. Open app → tap "New Listing"
  2. Take photos (or select from camera roll)
  3. Record voice note: "CDG Play tee, size large, 9/10 condition, no stains, asking $85"
  4. Upload to server → AI processes
  5. Review generated drafts for each platform
  6. Approve (or edit) → tap "Post"

[Desktop — Passive]
  7. Chrome with extension running in background
  8. Extension polls server for approved listings
  9. Extension posts to Grailed/Depop via internal APIs
  10. eBay is posted server-side via official API
  11. User gets push notification: "Listed on 3 platforms ✓"
```

## AI Agent Behavior

- **Single voice note extraction** — AI extracts all possible attributes from one voice note
- **Image-first intelligence** — AI can identify brand, category, item type, color from photos alone
- **Follow-up only when critical info is missing** — e.g., no size mentioned in voice and not detectable from photos
- **Platform-specific optimization** — different title formats, description styles, and category mappings per marketplace
- **No pre-configured categories** — AI infers category from voice + image context

## Architecture Decision

**Approach B: Server generates, extension posts** (proven industry pattern)

- **Server**: AI processing, listing generation, draft management, eBay OAuth API
- **Chrome Extension**: Reads user's marketplace session cookies, posts approved listings to Grailed/Depop via their internal APIs
- **Mobile PWA**: Thin client for capture, review, and approval

This matches how Flyp, Vendoo, and Crosslist all work. The extension piggybacks on the user's authenticated browser session — no credentials are stored or transmitted.

**Future optimization**: Token sync (Approach A) where the extension forwards session cookies to the server, enabling fully server-side posting. Not a one-way door — same extension code, just adds a token forwarding endpoint.

## Proof of Concept

Before building the full product, validate the core technical assumption:

**Grailed CLI Tool** — A command-line tool that wraps Grailed's internal REST API. Proves that:
1. Grailed's internal API endpoints work as mapped
2. Session cookie + CSRF token auth is viable
3. Full listing CRUD (create, read, update, delete) works programmatically
4. Image upload via presigned S3 works
5. The workflow can be driven by an AI agent (via OpenClaw)

The POC is packaged as an OpenClaw skill, allowing an AI agent to create Grailed listings from voice/text commands using the user's browser session for auth.

## Success Metrics

- **POC**: Successfully create and delete a real Grailed listing via CLI/API
- **MVP**: User can list an item on 3 platforms in under 60 seconds of active time
- **Quality**: AI-generated listings are accurate enough that user approves without editing >80% of the time

## Technical Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Grailed changes internal API | Medium | Monitor for breaking changes, API calls are simple REST |
| Anti-bot detection on Depop (PerimeterX) | High | Start with Grailed/eBay, add Depop after validation |
| Session cookies expire frequently | Medium | Extension refreshes tokens when Chrome is open |
| AI misidentifies item attributes | Medium | Always show draft for human review before posting |
| Platform TOS violation | Medium | Extension operates in user's own browser with their session (industry standard approach) |
