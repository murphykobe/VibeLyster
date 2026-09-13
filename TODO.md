# VibeLyster TODO

## Voice & AI Pipeline

- [x] **STT provider switched to Soniox** — `transcribeAudio()` now calls `POST https://api.soniox.com/v1/transcribe` with `SONIOX_API_KEY`. No longer depends on Whisper or `VERCEL_OIDC_TOKEN` for STT. Add `SONIOX_API_KEY` to the Vercel project env vars before deploying.
- [x] **Manual production generate coverage** — opt-in Playwright tests now cover transcript-only and transcript + image against `POST /api/generate`. Keep these out of CI because they incur AI cost.
- [ ] **Voice recorder on web** — `expo-av` recording works natively but behaviour on web export (Expo Router web) is untested. Test or add a web fallback for `VoiceRecorder.tsx`.

## Marketplace Integrations

- [ ] **eBay publishing** — connection verify works, but `publish`, `delist`, and `status` all return "not yet supported". Needs full implementation via eBay REST Sell API.
- [x] **eBay image upload** — `uploadImage()` now uses the Commerce Media API (`createImageFromFile` + `getImage`) instead of the Trading API's `UploadSiteHostedPictures`, which eBay decommissions 2026-09-30. `create` and `edit` auto-upload any local image paths in the draft JSON before building the inventory item, so the CLI no longer needs a separate manual upload step per photo.
- [x] **eBay auto token refresh** — already implemented: `getClient()` wires `OAuth2.on("refreshAuthToken", ...)` to persist the refreshed token to `~/.vibelyster/ebay.json` (skipped in headless/CI mode where `EBAY_REFRESH_TOKEN` is set directly).
- [ ] **Depop session auth** — uses `impit` to bypass Cloudflare. Fragile; Depop may break it with bot detection updates. Revisit when Depop opens their OAuth API.
- [x] **Depop image upload fixed** — `uploadImage()` was posting to `/api/v2/pictures/` with a stale payload shape (`type: "PRODUCT"`, no `dimensions`), hard-blocked at Cloudflare's edge (never reached Depop's backend). Real endpoint is now `/presentation/api/v1/pictures/`, lowercase `type`, and a required `dimensions: {width, height}` read from the actual file. The edge block also required real Fetch Metadata/Client Hints headers (`sec-fetch-*`, `sec-ch-ua*`) that `impit`'s TLS fingerprint alone doesn't add, now sent on every call. Verified end-to-end: presign reaches Depop's real backend, S3 PUT succeeds, Depop's own `/pictures/batch/<id>/` confirms the picture exists and passed `is_square`, and the resulting `media-photos.depop.com` URL serves the real image.
- [x] **Grailed Cloudflare block fixed** — `grailed-cli` was using bare Node `fetch()` with no browser TLS fingerprint. Grailed's Cloudflare started hard-blocking it outright (a static WAF block, not a stale-cookie error) even on the plain public homepage with zero auth. Fixed by routing through `impit` (`browser: "chrome"`), the same fix `depop-cli` already uses and for the same reason. Verified: `checkLogin()` now gets Grailed's own JSON 401 instead of a Cloudflare page. No public Grailed API means this has the same fragility risk as the Depop line above.
- [ ] **No test suite for grailed-cli or depop-cli** — unlike `tools/ebay`, neither has a `.test.js` file or CI coverage (root `package.json` workspaces only cover `apps/*`, not `tools/*`). The impit fix above was verified by direct manual testing, not an automated regression test.

## Infrastructure

- [ ] **Vercel Blob token on server** — confirm `BLOB_READ_WRITE_TOKEN` is set in the server Vercel project so photo uploads work in production (`POST /api/upload`).
- [x] **AI Gateway auth in production** — server now prefers `AI_GATEWAY_API_KEY` and falls back to `VERCEL_OIDC_TOKEN`. `AI_GATEWAY_API_KEY` is configured across Development / Preview / Production.
- [ ] **Clerk webhook for user sync** — users are upserted into Neon on first API call. No Clerk webhook handles account deletion or email changes. Add a `POST /api/webhooks/clerk` handler.

## Mobile App

- [ ] **Sign-up flow** — only sign-in exists. New users have no way to register from the app; accounts must be created manually in Clerk dashboard. Add a sign-up screen.
- [x] **Sign-out** — settings screen exposes sign-out for live auth and a mock-mode placeholder locally.
- [ ] **Error states** — API errors on the dashboard and listing screens are swallowed with `console.error`. Add user-visible error handling / toast messages.

## Deferred

- [ ] **eBay full integration** — see Marketplace section above.
- [ ] **Push notifications** — notify users when a listing status changes (sold, delisted).
- [ ] **Clerk production instance** — currently using `pk_test_` development keys. Switch to `pk_live_` before onboarding real users.
