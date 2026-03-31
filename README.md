# VibeLyster

AI-assisted cross-listing app for resellers.

VibeLyster lets a user:
- capture item photos and optional voice notes
- generate a canonical listing draft with AI
- edit the draft in one place
- publish the same draft to multiple marketplaces

## Repo structure

- `apps/mobile` — Expo / React Native app with Expo Router
- `apps/server` — Next.js backend API, auth, DB, AI generation, marketplace publishing
- `apps/e2e` — Playwright browser E2E tests
- `tools/grailed` — marketplace research / utility code
- `tools/depop` — marketplace research / utility code
- `docs` — architecture notes, test plan, deployment wiring

## Product flow

1. Upload photos to Blob
2. Call `POST /api/generate`
   - with photo URLs
   - optional audio
   - optional transcript override
3. Server generates a **canonical listing**
4. Draft is saved in DB
5. User reviews/edits the draft
6. User publishes to Grailed / Depop via deterministic adapter transforms

## Canonical listing model

AI generates one listing object, not one listing per marketplace.

Fields include:
- `title`
- `description`
- `price`
- `size`
- `condition`
- `brand`
- `category`
- `traits`

Marketplace-specific payloads are derived at publish time by adapter code in:
- `apps/server/lib/marketplace/grailed.ts`
- `apps/server/lib/marketplace/depop.ts`

## AI generation

`POST /api/generate` supports:
- `photos` only
- `audio` only
- `photos + audio`
- `transcript` only
- `transcript + photos`
- `transcript + audio` → transcript wins

### Generation pipeline

- STT: Soniox (`SONIOX_API_KEY`) when audio is provided and no transcript override exists
- LLM: Vercel AI Gateway using MiniMax M2.7
- Auth for gateway:
  - prefer `AI_GATEWAY_API_KEY`
  - fallback to `VERCEL_OIDC_TOKEN`

## Environment variables

### `apps/server`

Core:
- `DATABASE_URL`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `TOKEN_ENCRYPTION_KEY`
- `BLOB_READ_WRITE_TOKEN`

AI:
- `AI_GATEWAY_API_KEY` — recommended
- `VERCEL_OIDC_TOKEN` — optional fallback if available in runtime
- `SONIOX_API_KEY` — required for real audio transcription path

### `apps/mobile`

- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_MOCK_MODE`
- `EXPO_PUBLIC_MOCK_USER_ID`

## Local development

Install deps:
```bash
npm ci
```

Run backend:
```bash
cd apps/server
npm run dev
```

Run mobile:
```bash
cd apps/mobile
npm run dev
```

Run mock backend for local frontend work:
```bash
cd apps/server
npm run dev:mock
```

## Testing

### Server tests
```bash
cd apps/server
npm test
```

### Local browser E2E (mock mode)
```bash
cd apps/e2e
npm test
```

### Live preview E2E
```bash
cd apps/e2e
E2E_BASE_URL=https://mobile-one-theta.vercel.app \
E2E_API_URL=https://vibelyster.vercel.app \
E2E_EMAIL=your-test-user@example.com \
E2E_PASSWORD='your-password' \
npm run test:preview
```

### Manual AI E2E
This is opt-in and should not run in CI because it uses paid AI services.

```bash
cd apps/e2e
E2E_BASE_URL=https://mobile-one-theta.vercel.app \
E2E_API_URL=https://vibelyster.vercel.app \
E2E_EMAIL=your-test-user@example.com \
E2E_PASSWORD='your-password' \
E2E_MANUAL_AI=1 \
npm run test:preview:manual-ai -- tests/generate.manual.spec.ts
```

Current live coverage:
- auth/sign-in
- dashboard/settings smoke
- listing CRUD
- manual AI generate:
  - transcript only
  - transcript + image

## Deployment

Server deploy:
```bash
cd apps/server
npx vercel --prod --yes
```

Mobile web deploy:
```bash
cd apps/mobile
npx vercel --prod --yes
```

See also:
- `docs/vercel-wiring.md`
- `docs/test-plan.md`

## Notes

- Marketplace publishing is deterministic adapter logic, not a second LLM call per platform.
- Connect/disconnect marketplace flows are still evolving; CRUD and manual generate coverage are in better shape today.
- Secrets pasted into chat should be rotated after use.
