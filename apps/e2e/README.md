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

## Live eBay OAuth test

This is opt-in live coverage for the callback route plus real eBay sandbox code exchange.

```bash
cd apps/e2e
E2E_BASE_URL=https://mobile-one-theta.vercel.app \
E2E_API_URL=https://vibelyster.vercel.app \
E2E_EMAIL=your-clerk-test-user@example.com \
E2E_PASSWORD='your-password' \
E2E_EBAY_TEST=1 \
E2E_EBAY_SANDBOX=true \
E2E_EBAY_CLIENT_ID=your-ebay-client-id \
E2E_EBAY_RU_NAME=your-ebay-ru-name \
E2E_EBAY_SANDBOX_USERNAME=your-ebay-sandbox-username \
E2E_EBAY_SANDBOX_PASSWORD='your-ebay-sandbox-password' \
npm run test:preview:ebay
```

## Live eBay publish smoke

This smoke is **manual/secrets-gated** and is **not part of normal PR CI**.
It requires a real sandbox seller account that is fully seller-registered and eligible for Business Policy access.

```bash
cd apps/e2e
E2E_BASE_URL=https://mobile-one-theta.vercel.app \
E2E_API_URL=https://vibelyster.vercel.app \
E2E_EMAIL=your-clerk-test-user@example.com \
E2E_PASSWORD='your-password' \
E2E_EBAY_TEST=1 \
E2E_EBAY_SANDBOX=true \
E2E_EBAY_CALLBACK_HOST=https://vibelyster.vercel.app \
E2E_EBAY_CLIENT_ID=your-ebay-client-id \
E2E_EBAY_RU_NAME=your-ebay-ru-name \
E2E_EBAY_SANDBOX_USERNAME=your-ebay-sandbox-username \
E2E_EBAY_SANDBOX_PASSWORD='your-ebay-sandbox-password' \
npm run test:preview:ebay:publish -- --project=chromium
```

A manual GitHub Actions workflow is also available at:
- `.github/workflows/ebay-live-publish.yml`

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
