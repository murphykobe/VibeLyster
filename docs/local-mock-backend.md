# Local Mock Backend Guide

Use this mode to test frontend end-to-end flows without Neon, Clerk, Vercel Blob, AI Gateway, or marketplace APIs.

## 1) Start Server In Mock Mode

From repo root:

```bash
cd apps/server
MOCK_MODE=1 npm run dev
```

For LAN access (other devices on same network):

```bash
cd apps/server
npm run dev:mock:lan
```

`MOCK_MODE=1` enables:
- In-memory DB (`apps/server/lib/db.mock.ts`)
- Mock auth user creation (no Clerk token verification)
- Mock upload URLs
- Mock listing generation
- Mock publish/delist/status behavior
- Mock marketplace connection verification (no live probe)

## 2) Mock Auth Headers

In mock mode, authenticated routes accept:
- `x-mock-user-id` (optional, default: `mock-user`)
- `x-mock-user-email` (optional)

Example:

```bash
curl -s http://localhost:3001/api/listings \
  -H 'x-mock-user-id: ios-dev-1'
```

## 3) Mobile Mock Mode

Set these in `apps/mobile/.env`:

```bash
EXPO_PUBLIC_API_URL=http://localhost:3001
EXPO_PUBLIC_MOCK_MODE=1
EXPO_PUBLIC_MOCK_USER_ID=ios-dev-1
```

When `EXPO_PUBLIC_MOCK_MODE=1`:
- Mobile app bypasses Clerk sign-in guard
- API client sends `x-mock-user-id` instead of Bearer token

Start frontend:

```bash
cd apps/mobile
npm run dev          # localhost
npm run dev:lan      # LAN (for device access)
```

## 4) Suggested Frontend Flow (Manual)

1. `POST /api/connect` for `grailed` and/or `depop` with dummy tokens.
2. Upload 1-2 photos via `POST /api/upload` (or use direct mock URLs).
3. Create draft via `POST /api/generate` (multipart) or `POST /api/listings`.
4. Publish via `POST /api/publish` or `POST /api/publish/bulk`.
5. Refresh listing detail and status via `GET /api/status/:id`.
6. Delist via `POST /api/delist`.

## 5) Notes

- Mock DB state is process-memory only and resets when server restarts.
- Mock listing IDs are UUID-shaped to satisfy existing validators.
- Non-mock behavior is unchanged when `MOCK_MODE` is not set.
