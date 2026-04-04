# eBay Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add official eBay OAuth connection/disconnect support so a Clerk-authenticated VibeLyster user can connect an eBay account, verify it with eBay Identity `getUser`, and see connected state in Settings.

**Architecture:** The mobile app opens eBay's authorization URL in a WebView using the app's configured eBay `RuName`, intercepts the accept-URL callback, and sends the authorization code to the existing server API. The server exchanges the code using the eBay client secret, verifies the account with `getUser`, stores encrypted tokens in `marketplace_connections`, and returns the normalized connection row.

**Tech Stack:** Expo Router, `react-native-webview`, Next.js App Router, Clerk JWT auth, Zod validation, Vitest, eBay OAuth 2.0 authorization code grant, eBay Identity API.

---

## File Structure

- Modify: `apps/server/lib/validation.ts`
  Purpose: add an eBay-specific `POST /api/connect` payload shape for authorization-code exchange while preserving existing Grailed/Depop token-based payloads.

- Create: `apps/server/lib/marketplace/ebay.ts`
  Purpose: encapsulate eBay OAuth URL building, code exchange, identity verification, and response normalization.

- Create: `apps/server/lib/marketplace/__tests__/ebay.test.ts`
  Purpose: unit coverage for eBay helper behavior without hitting the network.

- Modify: `apps/server/app/api/connect/route.ts`
  Purpose: branch eBay connect through authorization-code exchange + `getUser`, then persist the connection in the existing table.

- Modify: `apps/server/app/api/__tests__/routes.test.ts`
  Purpose: prove eBay connect/disconnect works in route-level integration tests and keeps existing platforms intact.

- Modify: `apps/mobile/lib/api.ts`
  Purpose: add a typed helper for the eBay code-exchange request sent from the mobile connect screen.

- Modify: `apps/mobile/app/(tabs)/settings.tsx`
  Purpose: expose eBay in the marketplace list.

- Modify: `apps/mobile/app/connect/[platform].tsx`
  Purpose: implement eBay-specific WebView OAuth flow, state handling, callback interception, and save-to-server behavior.

- Modify: `apps/mobile/app/connect/[platform].web.tsx`
  Purpose: keep mock-web flow aligned with the new eBay connect payload shape used in tests and local browser development.

- Modify: `apps/mobile/app.json`
  Purpose: confirm the `vibelyster://` scheme remains the final callback target behind the eBay app's configured accept URL.

- Modify: `README.md`
  Purpose: document the new eBay connection-only env vars and note that eBay publish remains out of scope.

## Task 1: Add eBay server helper and unit tests

**Files:**
- Create: `apps/server/lib/marketplace/ebay.ts`
- Test: `apps/server/lib/marketplace/__tests__/ebay.test.ts`

- [ ] **Step 1: Write the failing unit tests for authorize URL, token exchange mapping, and `getUser` verification**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildEbayAuthorizeUrl,
  exchangeEbayAuthorizationCode,
  verifyEbayConnectionFromTokens,
} from "../ebay";

describe("buildEbayAuthorizeUrl", () => {
  it("builds an authorize URL with the minimum identity scope", () => {
    const url = buildEbayAuthorizeUrl({
      clientId: "client-id",
      ruName: "vibelyster-accept",
      state: "state-123",
    });

    expect(url).toContain("https://auth.ebay.com/oauth2/authorize");
    expect(url).toContain("client_id=client-id");
    expect(url).toContain("response_type=code");
    expect(url).toContain(encodeURIComponent("https://api.ebay.com/oauth/api_scope/commerce.identity.readonly"));
    expect(url).toContain("state=state-123");
  });
});

describe("exchangeEbayAuthorizationCode", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns normalized token data on success", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: "access-1",
      refresh_token: "refresh-1",
      token_type: "User Access Token",
      expires_in: 7200,
      refresh_token_expires_in: 47304000,
    }), { status: 200 }));

    const result = await exchangeEbayAuthorizationCode({
      clientId: "client-id",
      clientSecret: "client-secret",
      ruName: "vibelyster-accept",
      authorizationCode: "code-123",
    });

    expect(result.accessToken).toBe("access-1");
    expect(result.refreshToken).toBe("refresh-1");
    expect(result.expiresIn).toBe(7200);
  });
});

describe("verifyEbayConnectionFromTokens", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts userId with optional username", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      userId: "ebay-user-42",
      username: "closetcommander",
    }), { status: 200 }));

    const result = await verifyEbayConnectionFromTokens({ accessToken: "access-1" });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ebayUserId).toBe("ebay-user-42");
      expect(result.platformUsername).toBe("closetcommander");
    }
  });
});
```

- [ ] **Step 2: Run the test file to verify it fails**

Run: `cd apps/server && npx vitest run lib/marketplace/__tests__/ebay.test.ts`
Expected: FAIL with module-not-found or missing export errors for `../ebay`.

- [ ] **Step 3: Write the minimal helper implementation**

```ts
const EBAY_IDENTITY_SCOPE = "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly";

export function buildEbayAuthorizeUrl(input: {
  clientId: string;
  ruName: string;
  state: string;
}) {
  const url = new URL("https://auth.ebay.com/oauth2/authorize");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.ruName);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", EBAY_IDENTITY_SCOPE);
  url.searchParams.set("state", input.state);
  return url.toString();
}

export async function exchangeEbayAuthorizationCode(input: {
  clientId: string;
  clientSecret: string;
  ruName: string;
  authorizationCode: string;
}) {
  const basic = Buffer.from(`${input.clientId}:${input.clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.authorizationCode,
    redirect_uri: input.ruName,
  });

  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) throw new Error(`eBay token exchange failed (${res.status})`);
  const data = await res.json() as {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    refresh_token_expires_in?: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenType: data.token_type,
    expiresIn: data.expires_in,
    refreshTokenExpiresIn: data.refresh_token_expires_in ?? null,
  };
}

export async function verifyEbayConnectionFromTokens(input: { accessToken: string }) {
  const res = await fetch("https://apiz.ebay.com/commerce/identity/v1/user/", {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${input.accessToken}`,
    },
  });

  if (!res.ok) return { ok: false as const, error: `eBay verification failed (${res.status})` };

  const data = await res.json() as { userId?: string; username?: string };
  if (!data.userId) return { ok: false as const, error: "eBay verification failed: missing userId" };

  return {
    ok: true as const,
    ebayUserId: data.userId,
    platformUsername: data.username ?? undefined,
  };
}
```

- [ ] **Step 4: Run the helper test file to verify it passes**

Run: `cd apps/server && npx vitest run lib/marketplace/__tests__/ebay.test.ts`
Expected: PASS for all new eBay helper tests.

- [ ] **Step 5: Commit**

```bash
git add apps/server/lib/marketplace/ebay.ts apps/server/lib/marketplace/__tests__/ebay.test.ts
git commit -m "feat: add ebay oauth helper"
```

## Task 2: Add eBay connect payload validation and server route handling

**Files:**
- Modify: `apps/server/lib/validation.ts`
- Modify: `apps/server/app/api/connect/route.ts`
- Test: `apps/server/app/api/__tests__/routes.test.ts`

- [ ] **Step 1: Write failing route tests for eBay code-based connect**

```ts
it("connects ebay from authorization code in mock mode", async () => {
  const res = await connectPlatform(req("POST", "/api/connect", {
    body: {
      platform: "ebay",
      authorizationCode: "ebay-code-1",
      ruName: "vibelyster-accept",
    },
  }));

  expect(res.status).toBe(201);
  const data = await res.json();
  expect(data.platform).toBe("ebay");
});

it("returns 400 when ebay code payload is incomplete", async () => {
  const res = await connectPlatform(req("POST", "/api/connect", {
    body: { platform: "ebay", authorizationCode: "only-code" },
  }));

  expect(res.status).toBe(400);
});
```

- [ ] **Step 2: Run the route test subset to verify it fails**

Run: `cd apps/server && npx vitest run app/api/__tests__/routes.test.ts`
Expected: FAIL because `ConnectBody` still requires `tokens`.

- [ ] **Step 3: Replace the connect validation with a platform-aware schema and route branch**

```ts
const TokenConnectBody = z.object({
  platform: z.enum(["grailed", "depop"]),
  tokens: z.record(z.unknown()).refine((t) => Object.keys(t).length > 0, "tokens must be a non-empty object"),
  platformUsername: z.string().max(100).optional(),
  expiresAt: z.string().datetime().optional(),
});

const EbayConnectBody = z.object({
  platform: z.literal("ebay"),
  authorizationCode: z.string().min(1, "authorizationCode is required"),
  ruName: z.string().min(1, "ruName is required"),
});

export const ConnectBody = z.discriminatedUnion("platform", [TokenConnectBody, EbayConnectBody]);
```

```ts
if (parsed.data.platform === "ebay") {
  if (isMockMode()) {
    const connection = await upsertConnection(
      user.id,
      "ebay",
      encryptTokens({
        access_token: "mock-ebay-access-token",
        refresh_token: "mock-ebay-refresh-token",
        ebay_user_id: "mock-ebay-user-id",
      }),
      "mock-ebay-user",
      null,
    );

    return Response.json(connection, { status: 201 });
  }

  const exchanged = await exchangeEbayAuthorizationCode({
    clientId: process.env.EBAY_CLIENT_ID as string,
    clientSecret: process.env.EBAY_CLIENT_SECRET as string,
    ruName: parsed.data.ruName,
    authorizationCode: parsed.data.authorizationCode,
  });

  const verification = await verifyEbayConnectionFromTokens({
    accessToken: exchanged.accessToken,
  });

  if (!verification.ok) {
    return Response.json({ error: verification.error }, { status: 400 });
  }

  const expiresAt = new Date(Date.now() + exchanged.expiresIn * 1000).toISOString();
  const encrypted = encryptTokens({
    access_token: exchanged.accessToken,
    refresh_token: exchanged.refreshToken,
    token_type: exchanged.tokenType,
    ebay_user_id: verification.ebayUserId,
    expires_at: expiresAt,
    refresh_token_expires_in: exchanged.refreshTokenExpiresIn,
  });

  const connection = await upsertConnection(
    user.id,
    "ebay",
    encrypted,
    verification.platformUsername,
    expiresAt,
  );

  return Response.json(connection, { status: 201 });
}
```

- [ ] **Step 4: Run the full server test suite**

Run: `cd apps/server && npm test`
Expected: PASS, including the new eBay route tests and the existing 110-test baseline plus eBay additions.

- [ ] **Step 5: Commit**

```bash
git add apps/server/lib/validation.ts apps/server/app/api/connect/route.ts apps/server/app/api/__tests__/routes.test.ts
git commit -m "feat: support ebay code-based connect route"
```

## Task 3: Add a typed mobile API helper and expose eBay in Settings

**Files:**
- Modify: `apps/mobile/lib/api.ts`
- Modify: `apps/mobile/app/(tabs)/settings.tsx`

- [ ] **Step 1: Write the minimal mobile API helper**

```ts
export async function saveEbayConnection(params: {
  authorizationCode: string;
  ruName: string;
  state: string;
}) {
  return apiRequest<MarketplaceConnection>("POST", "/api/connect", {
    platform: "ebay",
    authorizationCode: params.authorizationCode,
    ruName: params.ruName,
    state: params.state,
  });
}
```

- [ ] **Step 2: Run mobile typecheck to verify no unused/import errors exist yet**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: PASS or a targeted error only if `saveEbayConnection` is not yet wired.

- [ ] **Step 3: Expose eBay in Settings using the existing marketplace row UI**

```ts
const PLATFORMS: { key: Platform; label: string }[] = [
  { key: "grailed", label: "Grailed" },
  { key: "depop", label: "Depop" },
  { key: "ebay", label: "eBay" },
];
```

- [ ] **Step 4: Re-run mobile typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: PASS with eBay now included in the platform list.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/lib/api.ts apps/mobile/app/'(tabs)'/settings.tsx
git commit -m "feat: expose ebay in settings"
```

## Task 4: Implement eBay WebView callback handling in the mobile connect screen

**Files:**
- Modify: `apps/mobile/app/connect/[platform].tsx`
- Modify: `apps/mobile/app.json`

- [ ] **Step 1: Add local state and helpers for the eBay authorize URL**

```ts
const EBAY_SCOPE = "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly";

function createOauthState() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildEbayAuthorizeUrl(params: { clientId: string; ruName: string; state: string }) {
  const url = new URL("https://auth.ebay.com/oauth2/authorize");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.ruName);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", EBAY_SCOPE);
  url.searchParams.set("state", params.state);
  return url.toString();
}
```

- [ ] **Step 2: Wire the eBay config with RuName and callback detection**

```ts
const EBAY_RU_NAME = process.env.EXPO_PUBLIC_EBAY_RU_NAME as string;
const ebayStateRef = useRef<string>(createOauthState());

const CONFIG: Record<Platform, { url: string; title: string }> = {
  grailed: { url: "https://www.grailed.com/", title: "Connect Grailed" },
  depop: { url: "https://www.depop.com/login/", title: "Connect Depop" },
  ebay: {
    url: buildEbayAuthorizeUrl({
      clientId: process.env.EXPO_PUBLIC_EBAY_CLIENT_ID as string,
      ruName: EBAY_RU_NAME,
      state: ebayStateRef.current,
    }),
    title: "Connect eBay",
  },
};
```

- [ ] **Step 3: Implement the eBay callback branch**

```ts
async function handleEbayCallback(url: string) {
  const parsed = new URL(url);
  const code = parsed.searchParams.get("code");
  const state = parsed.searchParams.get("state");

  if (!code) {
    Alert.alert("Error", "eBay did not return an authorization code.");
    return;
  }

  if (state !== ebayStateRef.current) {
    Alert.alert("Error", "eBay connection failed. Please try again.");
    return;
  }

  setSaving(true);
  try {
    await saveEbayConnection({
      authorizationCode: code,
      ruName: EBAY_RU_NAME,
      state,
    });

    Alert.alert("Connected!", "eBay account connected successfully.", [
      { text: "OK", onPress: () => router.back() },
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save eBay connection.";
    Alert.alert("Error", message);
  } finally {
    setSaving(false);
  }
}
```

- [ ] **Step 4: Call that branch from navigation handling and confirm app scheme**

```ts
if (typedPlatform === "ebay" && url.startsWith("vibelyster://connect/ebay")) {
  await handleEbayCallback(url);
  return;
}
```

```json
{
  "expo": {
    "scheme": "vibelyster"
  }
}
```

- [ ] **Step 5: Run mobile typecheck**

Run: `cd apps/mobile && npx tsc --noEmit`
Expected: PASS with the eBay callback flow compiled.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/connect/'[platform]'.tsx apps/mobile/app.json
git commit -m "feat: implement ebay mobile oauth callback"
```

## Task 5: Keep mock-web connect support aligned and document env vars

**Files:**
- Modify: `apps/mobile/app/connect/[platform].web.tsx`
- Modify: `README.md`

- [ ] **Step 1: Keep the web mock connect path working for eBay**

```ts
const tokens =
  typedPlatform === "grailed"
    ? { csrf_token: "mock-csrf-token", cookies: "csrf_token=mock-csrf-token; _session=mock" }
    : typedPlatform === "depop"
      ? { access_token: "mock-access-token" }
      : { access_token: "mock-ebay-access-token", refresh_token: "mock-ebay-refresh-token", ebay_user_id: "mock-ebay-user-id" };
```

- [ ] **Step 2: Document the required env vars in the README**

```md
eBay connection-only env:
- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`
- `EXPO_PUBLIC_EBAY_CLIENT_ID`

Notes:
- The mobile app uses `EXPO_PUBLIC_EBAY_CLIENT_ID` to build the consent URL.
- The server uses `EBAY_CLIENT_ID` + `EBAY_CLIENT_SECRET` to exchange the authorization code.
- eBay publish is still out of scope; this release only adds connect/disconnect.
```

- [ ] **Step 3: Run focused verification**

Run:
- `cd apps/server && npm test`
- `cd apps/mobile && npx tsc --noEmit`

Expected:
- server tests PASS
- mobile typecheck PASS

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/connect/'[platform]'.web.tsx README.md
git commit -m "docs: add ebay connection env wiring"
```

## Task 6: Manual verification checklist

**Files:**
- No code changes

- [ ] **Step 1: Configure local env**

Add the following values:

```bash
# apps/server/.env.local
EBAY_CLIENT_ID=your-ebay-client-id
EBAY_CLIENT_SECRET=your-ebay-client-secret

# apps/mobile/.env
EXPO_PUBLIC_EBAY_CLIENT_ID=your-ebay-client-id
EXPO_PUBLIC_EBAY_RU_NAME=your-ebay-ru-name
EXPO_PUBLIC_API_URL=http://localhost:3001
```

- [ ] **Step 2: Start the server and mobile app**

Run:

```bash
cd apps/server && npm run dev
cd apps/mobile && npm run dev
```

Expected:
- server boots without missing-env errors
- mobile app boots and Settings shows eBay

- [ ] **Step 3: Verify real connect flow**

Manual checks:

```text
1. Open Settings
2. Tap eBay → Connect
3. Complete eBay sign-in and consent
4. Confirm redirect returns to the app
5. Confirm Settings shows eBay connected
6. Relaunch app and confirm state persists
```

- [ ] **Step 4: Verify disconnect**

Manual checks:

```text
1. Tap Disconnect on eBay
2. Confirm the dialog
3. Verify eBay returns to Not connected
```

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "test: verify ebay connection flow"
```

## Self-Review

Spec coverage:
- official OAuth consent flow: Tasks 1, 2, 4
- least-privilege `commerce.identity.readonly`: Tasks 1, 4, 5
- verify with `getUser`: Tasks 1 and 2
- store stable `ebay_user_id` and optional `username`: Tasks 1 and 2
- expose connected/disconnected state in Settings: Tasks 3 and 4
- no publish/delist/status sync work: intentionally excluded from tasks

Placeholder scan:
- no `TBD`, `TODO`, or “similar to above” shortcuts remain in implementation steps
- every code-changing step names exact files and includes concrete code

Type consistency:
- server route uses `authorizationCode` and `ruName` consistently
- mobile helper sends the same property names to `/api/connect`
- canonical eBay identifier is consistently `ebay_user_id`
