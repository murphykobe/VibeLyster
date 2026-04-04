# eBay Native OAuth Testing Design

Date: 2026-04-04

## Goal

Add a local-first test strategy that proves the eBay OAuth connector works end to end across the browser/server boundary and the native iOS Expo app boundary.

This testing slice must validate:

1. the eBay callback route redirects correctly
2. the server can exchange a real sandbox authorization code and persist the connection
3. the iOS app can receive the OAuth deep link and finish the connect flow
4. the full iOS sandbox OAuth flow works from tap to connected state

## Scope

In scope:
- eBay-only OAuth testing
- local developer execution only
- iOS simulator only
- Playwright coverage for browser/server responsibilities
- Maestro coverage for native Expo iOS responsibilities
- dev/test-only app testability hooks if needed for deterministic deep-link testing

Out of scope:
- Android automation
- CI or nightly wiring
- Grailed or Depop native OAuth automation
- handling MFA, CAPTCHA, or extra sandbox verification challenges
- eBay publish, delist, or listing flows

If sandbox login presents MFA, CAPTCHA, or other extra verification, that is treated as an environment issue rather than a product bug.

## Recommended Approach

Use a hybrid testing stack:

1. Playwright in `apps/e2e` for callback-route and server-exchange validation
2. Maestro for deterministic iOS native deep-link smoke
3. Maestro for full live iOS sandbox OAuth automation

This is preferred over Maestro-only because it separates failures more cleanly:
- Playwright isolates callback route and server exchange behavior
- Maestro deterministic isolates app deep-link and state handling
- Maestro live isolates real WebView/runtime behavior

## Architecture

### Playwright layer

Extend `apps/e2e` with eBay-specific live coverage that runs only when explicit env vars are present.

Responsibilities:
- validate `GET /api/ebay/callback` redirects to `vibelyster://connect/ebay?...`
- validate all expected query params are preserved in the redirect
- validate a real `POST /api/connect` request with an eBay sandbox authorization code succeeds against the live server
- optionally verify connected state through the app web surface when the execution environment supports it

This layer is primarily responsible for:
- callback route correctness
- server token exchange correctness
- server-side failure classification

Because browser automation cannot verify iOS deep-link handoff into Expo, Playwright is not the native end-to-end authority.

### Maestro layer

Add a native E2E suite for iOS flows, under either:
- `apps/mobile/.maestro`, or
- `apps/maestro`

Recommended location: `apps/mobile/.maestro`, because the flows are tied directly to the mobile app and its dev-build/runtime configuration.

Responsibilities:
- deterministic deep-link callback smoke
- full live sandbox OAuth in iOS simulator

The Maestro suite should run against an Expo iOS dev build, not Expo web.

### App-side testability

The app currently validates the eBay OAuth `state`. That is correct production behavior, but it means a deterministic deep-link smoke test needs a controlled way to produce a valid callback.

Add a dev/test-only helper gated behind non-production configuration. Acceptable designs include:
- expose the currently pending eBay OAuth state in the debug UI
- add a dev-only action that seeds a known state value before opening the eBay connect screen

Requirements for this helper:
- unavailable in production behavior
- unavailable in normal release builds
- minimal scope, only for eBay native testability
- does not weaken live OAuth state validation in production

## Execution Order

Implement and verify in this sequence.

### 1. Playwright callback test

Purpose:
- prove `/api/ebay/callback` redirects to `vibelyster://connect/ebay?...`
- prove query params are preserved exactly

Expected proof:
- response status is redirect
- `Location` header starts with `vibelyster://connect/ebay`
- `code`, `state`, and error params survive the redirect mapping

### 2. Playwright live server connect test

Purpose:
- prove the live server can exchange a real sandbox authorization code and store the eBay connection

Auth-code source options:
- preferred: browser automation obtains the code from the sandbox authorize flow in the same test session
- fallback: accept an explicit env-provided one-time authorization code for manual/local runs

Expected proof:
- `POST /api/connect` returns success for `platform = ebay`
- response contains the normalized connection row
- saved connection can be observed through the existing connection API or app surface

### 3. Maestro deterministic deep-link smoke

Purpose:
- prove the iOS app can receive a valid `vibelyster://connect/ebay?...` callback, complete the save, and show connected state

Expected flow:
1. launch iOS dev build
2. navigate to Settings
3. open eBay connect
4. obtain or seed a valid OAuth state via dev/test helper
5. trigger deep link with matching `code` and `state`
6. assert the app processes the callback
7. assert Settings shows eBay connected

This test is the main proof for native deep-link handoff and app-side callback logic.

### 4. Maestro full live sandbox OAuth

Purpose:
- prove the full real sandbox OAuth flow works in the iOS simulator runtime

Expected flow:
1. launch iOS dev build
2. open Settings
3. tap eBay connect
4. complete eBay sandbox login in WebView
5. accept consent
6. let eBay redirect through `/api/ebay/callback`
7. let iOS hand off to `vibelyster://connect/ebay?...`
8. assert the app returns to a connected state in Settings

This is the final authority for the complete native eBay OAuth happy path.

## Environment Model

### Existing env relied on

Server:
- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`
- live server auth and DB env already required by the app

Mobile:
- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_EBAY_CLIENT_ID`
- `EXPO_PUBLIC_EBAY_RU_NAME`
- existing Expo/Clerk env as needed by the app runtime

### New test env expected

Playwright live eBay:
- `E2E_EBAY_TEST=1` or equivalent opt-in flag
- `E2E_EBAY_SANDBOX_USERNAME`
- `E2E_EBAY_SANDBOX_PASSWORD`
- optional fallback `E2E_EBAY_AUTH_CODE` for manual one-time code injection

Maestro iOS live eBay:
- `MAESTRO_EBAY_SANDBOX_USERNAME`
- `MAESTRO_EBAY_SANDBOX_PASSWORD`

If a shared naming convention is preferred later, the exact variable names can be normalized during implementation. The requirement is explicit opt-in and no accidental execution.

## Failure Isolation

Expected ownership of failures:

### Playwright callback failure
Likely causes:
- incorrect callback route implementation
- incorrect redirect URL construction
- lost query params

### Playwright live connect failure
Likely causes:
- bad eBay sandbox credentials
- broken auth-code capture path
- server token exchange bug
- server verification or persistence bug

### Maestro deterministic failure
Likely causes:
- app not handling deep links correctly
- eBay state validation mismatch
- save request not firing from callback handler
- native screen state or navigation bug

### Maestro live sandbox failure
Likely causes:
- WebView runtime issue
- iOS deep-link handoff issue
- mismatch between callback route and app expectations
- real OAuth runtime regressions not visible in browser-only tests

## Test Data and Safety

- use a dedicated eBay sandbox account created specifically for automation
- assume no MFA/CAPTCHA in the sandbox account
- treat one-time auth codes as ephemeral and non-reusable
- require explicit opt-in env flags before running live tests
- do not log secrets to committed fixtures or test output intentionally

## Files and Outputs

Expected implementation outputs:

### Playwright
- new eBay live spec under `apps/e2e/tests/`
- helper updates in `apps/e2e/tests/live-helpers.ts` or a new eBay-specific helper file
- documentation updates in `apps/e2e/README.md`

### Maestro
- Maestro flow files under `apps/mobile/.maestro/`
- optional helper scripts for launching simulator flows
- documentation for local execution in `docs/testing-guide.md` and/or `README.md`

### Mobile app
- small dev/test-only hook in `apps/mobile/app/connect/[platform].tsx` or closely related code
- any required debug/test affordance kept strictly non-production

## Verification Strategy

Local verification is complete when a developer can run the following sequence successfully:

1. Playwright callback redirect test passes
2. Playwright live eBay server connect test passes
3. Maestro deterministic iOS deep-link smoke passes
4. Maestro live iOS sandbox OAuth passes

## Done Criteria

This work is done when all of the following are true:
- the callback route redirect is automatically verified
- the server can exchange a real sandbox auth code in automated local testing
- the iOS app can deterministically consume a valid eBay callback deep link
- the full iOS sandbox OAuth flow runs end to end through the native app
- the new test paths are documented for local execution

## Deferred Work

Explicitly deferred:
- CI integration
- Android coverage
- generalized native OAuth testing for Grailed and Depop
- broader marketplace smoke infrastructure
- non-local scheduling or nightly automation
