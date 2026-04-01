# VibeLyster Testing Guide

Last updated: 2026-04-01

This is the practical testing guide for the repo.

Use it when you want to answer:
- how we should test publish and marketplace flows
- what is actually verified today
- which paths are deterministic vs live
- which backend mode to run locally
- what the connect/publish APIs look like

See also:
- `docs/test-plan.md` for the full desired test inventory

---

## 1. Testing Strategy

### Deterministic vs live

We split testing into two buckets:
- deterministic CI-style testing for code we own
- live marketplace smoke testing for runtime compatibility

PR CI should not depend on:
- real Grailed session cookies
- real Depop access tokens
- magic-link email delivery
- CAPTCHA / anti-bot behavior

Reason:
- those flows are flaky
- they are hard to provision safely
- they are not a good fit for required PR checks

### Test layers

We use four layers:
1. adapter unit tests
2. server route/integration tests
3. browser or native app smoke tests against deterministic backends
4. live marketplace smoke tests

### Core design decision

Publish is tested primarily as a server-side state transition API.

The mobile app captures marketplace credentials and stores them with `/api/connect`. Later, the app calls `/api/publish`, and the server decrypts tokens and publishes server-side. That makes publish logic much more testable than a purely client-side approach.

### Native CI direction

If we add native smoke CI, the first target should be a simulator-based smoke layer with fake auth pages and deterministic upstreams. Earlier notes proposed Maestro for this because it is lighter than Detox for launch/tap/assert coverage.

Live marketplace tests should stay manual or nightly and remain non-blocking.

---

## 2. Current Testing Modes

### A. Server unit and integration tests

Purpose:
- validate adapters
- validate route behavior
- validate crypto and mock DB behavior

Run:

```bash
cd apps/server
npm test
```

Best for:
- publish logic
- error classification
- validation
- request and response behavior

### B. Web or browser testing

Purpose:
- validate Expo web UI flows
- validate CRUD and mock backend integration
- validate browser automation

Typical setup:

```bash
cd apps/server && npm run dev:mock
cd apps/mobile && EXPO_PUBLIC_MOCK_MODE=1 EXPO_PUBLIC_API_URL=http://localhost:3001 npx expo start --web
npx playwright test
```

Good for:
- dashboard
- listing CRUD
- settings UI
- mock publish and delist flow

Not good for:
- native WebView auth
- native cookie capture
- native-only modules

### C. iOS simulator or native dev client testing

Purpose:
- validate the real mobile runtime
- validate native WebView marketplace auth
- validate native cookie capture

Typical local env:

```env
EXPO_PUBLIC_API_URL=http://127.0.0.1:3001
EXPO_PUBLIC_MOCK_MODE=1
EXPO_PUBLIC_MOCK_USER_ID=ios-dev-1
```

Good for:
- app boot
- settings and connect screens
- native Grailed auth capture
- device-only behavior

Important limitation:
- if the backend is still in mock mode, publish and delist remain mocked even when the mobile auth cookies are real

### D. Live marketplace smoke

Purpose:
- validate real Grailed and Depop behavior
- validate real connection reuse
- validate real publish and delist calls

Use this sparingly:
- manual runs
- nightly workflows
- pre-release validation

---

## 3. Current Verification Status

## Verified

### Mobile app boots in iOS simulator
- the app renders successfully in the simulator
- the main dashboard is visible

### Grailed native auth capture works
- Grailed connection was verified in the simulator
- the app reads cookies from the iOS WKWebView cookie store
- `grailed_jwt` was visible after login
- saving the connection succeeded after cookie detection

### Mock backend listing flow works
- a draft listing can be created or seeded
- the mobile app can load the listing from the mock backend

### Server test suite passes
- `cd apps/server && npm test`
- `cd apps/server && npx tsc --noEmit`

## Partially verified

### Depop auth UX
- the connect screen exists
- the app can inspect Depop cookies and URL changes
- a paste-magic-link input exists

But:
- simulator paste caused friction
- the full Depop happy path is not yet confirmed end-to-end

### Publish flow from simulator
- UI and API flow can be tested in mock mode
- real marketplace posting is not yet fully verified from the current simulator setup

## Not yet fully verified

### Real Grailed publish from live backend
- not yet confirmed end-to-end in the current documented setup

### Real Depop connect and publish
- not yet confirmed end-to-end

### Full capture to generate to publish happy path
- pieces exist, but not fully validated in one clean pass

---

## 4. Backend Modes

### Mock backend

Run:

```bash
cd apps/server
npm run dev:mock
```

Mock mode is for:
- frontend development
- browser tests
- simulator smoke tests

What is mocked:
- auth
- DB persistence
- upload and generate side effects
- marketplace verification
- publish, delist, and status side effects

Mental model:
- real API contract
- fake infrastructure
- fake marketplace side effects

### Live backend

Run:

```bash
cd apps/server
npm run dev
```

Live mode is required for:
- real marketplace verification
- real token decryption path
- real publish and delist calls

Practical rule:
- use mock mode for UI and flow work
- use live mode only when validating real marketplace behavior

---

## 5. Publish and Connection APIs

### `POST /api/connect`

Used by the mobile app to store marketplace credentials after auth capture.

Example Grailed body:

```json
{
  "platform": "grailed",
  "tokens": {
    "csrf_token": "...",
    "cookies": "name=value; ..."
  },
  "platformUsername": "optional",
  "expiresAt": "optional-iso-datetime"
}
```

Example Depop body:

```json
{
  "platform": "depop",
  "tokens": {
    "access_token": "..."
  }
}
```

Server behavior:
1. verify connection in live or mock mode
2. encrypt tokens
3. upsert `marketplace_connections`

Related endpoints:
- `GET /api/connections`
- `DELETE /api/connect?platform=grailed`

### `POST /api/publish`

Example body:

```json
{
  "listingId": "00000000-0000-4000-8000-000000000007",
  "platforms": ["grailed"]
}
```

Example success shape:

```json
{
  "results": {
    "grailed": {
      "ok": true,
      "platformListingId": "123456789"
    }
  }
}
```

Server behavior:
1. load the saved connection
2. mark platform row as `publishing`
3. in mock mode, mark it `live` with a mock platform listing id
4. in live mode, decrypt tokens and call the marketplace adapter
5. update the row to `live` or `failed`

Retry behavior:
- currently retries once for retryable failures
- 2 attempts total
- 2 second delay between attempts

### `POST /api/publish/bulk`

Example body:

```json
{
  "listingIds": [
    "00000000-0000-4000-8000-000000000007",
    "00000000-0000-4000-8000-000000000008"
  ],
  "platforms": ["grailed", "depop"]
}
```

Behavior:
- acknowledges immediately
- marks rows as `publishing`
- processes asynchronously
- expects the app to refresh or poll afterward

---

## 6. Recommended Local Testing Matrix

| Goal | Best path |
|---|---|
| Validate adapter logic | `apps/server` tests |
| Validate route behavior | `apps/server` tests in mock mode |
| Validate mobile CRUD UI | Expo web + mock backend |
| Validate native auth capture | iOS simulator + native dev client |
| Validate real publish | iOS simulator + live backend |

Practical shorthand:
- use web for mock UI coverage
- use simulator for native auth coverage
- use live backend only for real publish verification

---

## 7. Next Useful End-to-End Steps

### Option A. Stay in mock mode

Best for UI and flow verification.

1. create or seed a draft listing
2. open listing detail in simulator
3. publish to Grailed
4. verify the row changes to `live`
5. delist and verify it reverts

### Option B. Switch to live backend

Best for real publish verification.

1. stop `npm run dev:mock`
2. start `cd apps/server && npm run dev`
3. reconnect the marketplace against the live backend
4. publish a seeded listing again
5. inspect logs and resulting platform listing id

---

## 8. Future Work

- add route tests for `/api/publish`, `/api/publish/bulk`, and `/api/delist`
- add crypto round-trip tests
- add deterministic fake auth pages for native smoke testing
- add env-overridable marketplace base URLs for fake upstreams
- add simulator smoke automation for launch, connect, publish, and failure states
- keep live marketplace smoke non-blocking
