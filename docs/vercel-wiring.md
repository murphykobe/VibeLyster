# Vercel Wiring Guide

This repo deploys the backend from `apps/server` (Next.js API + auth + DB).
The mobile app (`apps/mobile`) talks to that backend through `EXPO_PUBLIC_API_URL`.

## 1) Backend Project Link

`apps/server/.vercel/project.json` is already linked to project `vibelyster`.

Run:

```bash
cd apps/server
npx vercel pull --yes --environment=production
npx vercel pull --yes --environment=preview
```

Or from repo root:

```bash
npm run vercel:server:pull:production
npm run vercel:server:pull:preview
```

## 2) Required Server Environment Variables

Required by live mode code paths:

- `DATABASE_URL` (Neon/Postgres)
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `AI_GATEWAY_API_KEY` (recommended for AI Gateway auth)
- `VERCEL_OIDC_TOKEN` (optional OIDC-based AI Gateway auth, if supported by runtime)
- `TOKEN_ENCRYPTION_KEY` (64-hex-char key for encrypting stored marketplace tokens)
- `BLOB_READ_WRITE_TOKEN` (required by `/api/upload` in non-mock mode)

Notes:

- `TOKEN_ENCRYPTION_KEY` is app-level server-side encryption in `apps/server/lib/crypto.ts`.
- It is not client-side encryption.
- Vercel stores env vars securely, but does not encrypt your DB columns for you.

## 3) Add Missing Env Vars

Generate encryption key:

```bash
openssl rand -hex 32
```

Set env vars:

```bash
cd apps/server
npx vercel env add TOKEN_ENCRYPTION_KEY production
npx vercel env add TOKEN_ENCRYPTION_KEY development
npx vercel env add BLOB_READ_WRITE_TOKEN production
npx vercel env add BLOB_READ_WRITE_TOKEN preview
npx vercel env add BLOB_READ_WRITE_TOKEN development
```

Preview caveat:

- If your Vercel project has no connected Git repo, branch-scoped preview env operations may fail.
- Connect the Git repo in Vercel project settings first, then re-run preview env commands.

## 4) Deploy Backend

From `apps/server`:

```bash
npx vercel --yes            # preview
npx vercel --prod --yes     # production
```

From repo root:

```bash
npm run vercel:server:deploy:preview
npm run vercel:server:deploy:production
```

## 5) Wire Mobile to Deployed Backend

Set `apps/mobile/.env`:

```bash
EXPO_PUBLIC_API_URL=https://<your-server-domain>
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=<same as server NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY>
EXPO_PUBLIC_MOCK_MODE=0
```

Then run:

```bash
cd apps/mobile
npx expo start --host localhost --port 8081
```

## 6) Quick Smoke Test

Backend:

```bash
curl -i https://<your-server-domain>/api/listings
```

Expect:

- `401` without token (normal in live mode), or
- `200` with valid auth.

Uploads:

- `/api/upload` will fail in live mode until `BLOB_READ_WRITE_TOKEN` is set.
