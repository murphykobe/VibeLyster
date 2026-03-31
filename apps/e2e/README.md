# E2E tests

## Local mock mode

```bash
cd apps/e2e
npm test
```

This starts:
- mock backend on `http://localhost:3001`
- Expo Web on `http://localhost:8081`

## Deployed preview mode

Run the suite against a deployed web preview with a real Clerk test user:

```bash
cd apps/e2e
E2E_BASE_URL=https://mobile-one-theta.vercel.app \
E2E_EMAIL=your-test-user@example.com \
E2E_PASSWORD='your-password' \
npm run test:preview
```

Optional:
- `E2E_API_URL=https://your-api-origin` if the API origin differs from `E2E_BASE_URL`

Preview mode runs:
1. `tests/auth.setup.ts` to sign in and persist auth state
2. `*.live.spec.ts` smoke tests against the deployed app

## Manual AI generate test

This suite is excluded by default so it does not run in CI or normal preview smoke runs.
It is intended for manual, cost-bearing validation of `/api/generate`.

Current manual cases:
- transcript + image
- transcript only

```bash
cd apps/e2e
E2E_BASE_URL=https://mobile-one-theta.vercel.app \
E2E_API_URL=https://vibelyster.vercel.app \
E2E_EMAIL=your-test-user@example.com \
E2E_PASSWORD='your-password' \
E2E_MANUAL_AI=1 \
npm run test:preview:manual-ai -- tests/generate.manual.spec.ts
```
