# VibeLyster TODO

## Voice & AI Pipeline

- [x] **STT provider switched to Soniox** — `transcribeAudio()` now calls `POST https://api.soniox.com/v1/transcribe` with `SONIOX_API_KEY`. No longer depends on Whisper or `VERCEL_OIDC_TOKEN` for STT. Add `SONIOX_API_KEY` to the Vercel project env vars before deploying.
- [ ] **Test generate flow in production** — `POST /api/generate` now calls MiniMax M2.7 via AI Gateway. No integration test against the live deployment yet. Verify photo → MiniMax vision → listing JSON round-trip works against `vibelyster.vercel.app`.
- [ ] **Voice recorder on web** — `expo-av` recording works natively but behaviour on web export (Expo Router web) is untested. Test or add a web fallback for `VoiceRecorder.tsx`.

## Marketplace Integrations

- [ ] **eBay publishing** — connection verify works, but `publish`, `delist`, and `status` all return "not yet supported". Needs full implementation via eBay REST Sell API.
- [ ] **Depop session auth** — uses `impit` to bypass Cloudflare. Fragile; Depop may break it with bot detection updates. Revisit when Depop opens their OAuth API.

## Infrastructure

- [ ] **Vercel Blob token on server** — confirm `BLOB_READ_WRITE_TOKEN` is set in the server Vercel project so photo uploads work in production (`POST /api/upload`).
- [ ] **AI Gateway OIDC in production** — confirm OIDC credentials are available server-side. Run a real `POST /api/generate` request against prod with a real photo to verify end-to-end.
- [ ] **Clerk webhook for user sync** — users are upserted into Neon on first API call. No Clerk webhook handles account deletion or email changes. Add a `POST /api/webhooks/clerk` handler.

## Mobile App

- [ ] **Sign-up flow** — only sign-in exists. New users have no way to register from the app; accounts must be created manually in Clerk dashboard. Add a sign-up screen.
- [ ] **Sign-out** — no sign-out button in the Settings screen.
- [ ] **Error states** — API errors on the dashboard and listing screens are swallowed with `console.error`. Add user-visible error handling / toast messages.

## Deferred

- [ ] **eBay full integration** — see Marketplace section above.
- [ ] **Push notifications** — notify users when a listing status changes (sold, delisted).
- [ ] **Clerk production instance** — currently using `pk_test_` development keys. Switch to `pk_live_` before onboarding real users.
