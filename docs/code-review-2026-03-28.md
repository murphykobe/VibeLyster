# VibeLyster Code Review (2026-03-28)

## Findings

### 1. High: Bulk publish work can be dropped after response (serverless lifecycle risk)
- Files:
  - `apps/server/app/api/publish/bulk/route.ts:40`
  - `apps/server/app/api/publish/bulk/route.ts:50`
- Why this is a problem:
  - The route returns immediately and starts `processInBackground(...)` without awaiting it.
  - In serverless/runtime-managed environments, background async work is not guaranteed to continue after the response lifecycle ends.
  - Result: listings can remain stuck in `publishing` with partial/no actual publish attempts.
- Suggested fix:
  - Move bulk publish to a durable worker/queue.
  - If staying in-route, use a framework-supported background primitive that explicitly extends lifecycle (and still add idempotent retry/recovery jobs).

### 2. High: Listing detail screen cannot publish new listings (no platform rows rendered)
- Files:
  - `apps/mobile/app/listing/[id].tsx:254`
  - `apps/mobile/app/listing/[id].tsx:163`
- Why this is a problem:
  - UI renders publish controls only by iterating `listing.platform_listings`.
  - New listings have no `platform_listings` rows until first publish attempt, so no platform action rows appear at all.
  - User cannot initiate first publish from listing detail unless rows were pre-created elsewhere.
- Suggested fix:
  - Render rows from a fixed platform list (`grailed`, `depop`) and merge in existing platform state when present.
  - Treat missing rows as `not connected`/`pending` UI state.

### 3. High: Mobile app fails TypeScript build
- Evidence:
  - `cd apps/mobile && npx tsc --noEmit` fails.
- Files:
  - `apps/mobile/app/connect/[platform].tsx:142`
  - `apps/mobile/app/sign-in.tsx:4`
  - `apps/mobile/package.json:11`
- Why this is a problem:
  - `injectedJavaScriptBeforeContentLoadedOnce` is not in the installed `react-native-webview` type surface.
  - `expo-web-browser` is imported but not listed in dependencies.
  - CI/build reproducibility breaks for mobile package.
- Suggested fix:
  - Replace with supported prop (`injectedJavaScriptBeforeContentLoaded`) or update `react-native-webview` to a compatible version and verify types.
  - Add `expo-web-browser` dependency and re-run typecheck.

### 4. Medium: Publish attempt counter is inaccurate (off-by-one on first failure)
- Files:
  - `apps/server/app/api/publish/route.ts:78`
  - `apps/server/app/api/publish/route.ts:98`
- Why this is a problem:
  - Code sets `attempt_count: 1` before the first attempt, then increments on failure.
  - First failed publish records as `2` attempts, which breaks operational metrics and retry logic expectations.
- Suggested fix:
  - Start from existing counter and increment exactly once per actual outbound publish attempt.
  - Or initialize at `0`, increment pre-attempt, and do not increment again in failure handler.

### 5. Medium: Grailed connection capture likely misses required session cookies
- Files:
  - `apps/mobile/app/connect/[platform].tsx:35`
  - `apps/mobile/app/connect/[platform].tsx:69`
- Why this is a problem:
  - Current implementation stores `document.cookie` as the cookie jar.
  - `document.cookie` does not include `HttpOnly` cookies; many auth sessions rely on those.
  - The server later forwards this as `Cookie` header for publish calls, so auth can fail despite “Connected!” UI.
- Suggested fix:
  - Capture cookies via native cookie manager APIs / WebView cookie store rather than JS page context.
  - Validate connection server-side with a lightweight authenticated marketplace call before marking connected.

## Open Questions
- Are platform rows intentionally created before listing detail loads (e.g., at listing creation time)? Current code path suggests no.
- Is bulk publish intended to be reliable in production, or best-effort MVP only? Current behavior is best-effort.

## Validation Run
- `cd apps/server && npx tsc --noEmit` passed.
- `cd apps/mobile && npx tsc --noEmit` failed with the errors noted above.

## Residual Testing Gaps
- No automated tests found/executed for API routes or mobile flows.
- Critical paths needing coverage: first-time publish UX, bulk publish completion guarantees, and connection token validity checks.
