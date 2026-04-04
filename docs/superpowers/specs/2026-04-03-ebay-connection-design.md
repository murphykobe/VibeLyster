# eBay Connection-Only Design

Date: 2026-04-03
Status: Proposed
Scope: eBay connect/disconnect only. No publish, delist, or status sync in this slice.

## Goal

Add a minimal eBay connection flow that proves VibeLyster can:

1. Start an official eBay OAuth consent flow
2. Exchange the returned authorization code for user tokens
3. Verify the connected eBay account through eBay's Identity API
4. Persist the connection against the current Clerk-authenticated VibeLyster user
5. Show connected/disconnected state in the app

This slice intentionally stops at account connection. It does not attempt eBay listing creation, business policy setup, category aspect mapping, or seller onboarding beyond basic identity verification.

## Why This Slice

eBay publish is materially more complex than Grailed or Depop because it requires seller policy configuration, marketplace/category requirements, and offer/inventory flows. The safest first step is to prove the auth and token lifecycle independently.

This keeps the first eBay milestone narrow:

- least-privilege user consent
- stable account identification
- low UI complexity
- no listing-side coupling

## Product Decisions

### Consent Scope

Use only:

`https://api.ebay.com/oauth/api_scope/commerce.identity.readonly`

Rationale:

- sufficient to verify the authenticated eBay account with `getUser`
- smallest practical scope for connection-only
- avoids asking for seller permissions before publish exists

### What Counts as a Successful Connection

A connection is successful when:

1. eBay returns an authorization code
2. the server exchanges that code for tokens
3. the server calls `GET /commerce/identity/v1/user/`
4. the response contains a valid `userId`
5. the connection is stored in `marketplace_connections`

### Canonical eBay Account Identifier

Use eBay `userId` as the canonical stored marketplace identifier.

`username` is display-only:

- store it when present
- do not rely on it for identity
- if absent, still treat the connection as valid

### Connected-State Display

Settings UI behavior for eBay:

- before connect: `Not connected`
- after connect, if `username` exists: show `username`
- after connect, if `username` is absent: show `Connected`

## Existing System Context

The app already has the correct ownership model for marketplace connections:

- Clerk JWT identifies the current app user
- server verifies the JWT and upserts `users.clerk_id`
- internal data relationships use `users.id`
- `marketplace_connections.user_id` links each marketplace account to the app user

This means the eBay connection does not need eBay email for ownership or account linking. The app-user-to-marketplace-account mapping is already solved by the existing schema.

## Proposed Flow

### 1. Start OAuth

From the mobile app, tapping `Connect` on eBay opens a WebView to eBay's OAuth authorize URL.

Required query parameters:

- `client_id`
- `redirect_uri`
- `response_type=code`
- `scope=<commerce.identity.readonly>`
- `state=<signed or random anti-CSRF value>`

The redirect target should be an app-controlled callback URL that the mobile app can intercept reliably.

### 2. Capture Authorization Code

When eBay redirects back after consent:

- the app intercepts the callback URL
- extracts `code`
- validates that `state` matches the original request
- sends the `code` to the server over the existing authenticated API channel

The app should not exchange the code directly with eBay. Token exchange belongs on the server because it requires the eBay client secret.

### 3. Exchange Code for Tokens

The server exchanges the authorization code at eBay's OAuth token endpoint and receives:

- `access_token`
- `refresh_token`
- `token_type`
- `expires_in`
- potentially refresh-token expiry metadata depending on response shape/environment

### 4. Verify Identity

After token exchange, the server calls eBay Identity API `getUser`.

The verification succeeds only if:

- the HTTP response is successful
- `userId` is present

Store:

- `ebay_user_id` from `userId`
- optional `platform_username` from `username`

### 5. Persist Connection

Store the eBay connection in the existing `marketplace_connections` row for `platform = 'ebay'`.

Encrypted token payload should include:

- `access_token`
- `refresh_token`
- `token_type`
- `expires_at` or enough fields to derive expiry
- `ebay_user_id`

Plain columns:

- `platform_username` = `username` when present
- `expires_at` = access-token expiry timestamp if tracked here

### 6. Return to Settings

On success:

- close the eBay WebView flow
- navigate back to Settings
- refresh connections
- show connected state

## API Design

### Preferred API Shape

Keep the existing `POST /api/connect` route as the persistence/verification layer, but add an eBay-specific code-exchange path instead of requiring a raw access token.

Recommended request body for eBay:

```json
{
  "platform": "ebay",
  "authorizationCode": "<ebay code>",
  "redirectUri": "<matching redirect uri>",
  "state": "<original state>"
}
```

Server responsibilities:

- validate payload
- exchange code for tokens
- call `getUser`
- persist connection
- return normalized connection response

This is preferable to having the client pass raw access tokens because it keeps secret-handling entirely server-side and matches the official OAuth flow.

### Disconnect

Use the existing `DELETE /api/connect?platform=ebay`.

Disconnect behavior:

- delete the marketplace connection row
- do not attempt token revocation in this slice
- user can reconnect later through the same OAuth flow

## Mobile UI Design

### Settings

Expose eBay in the same marketplace list as Grailed and Depop.

States:

- not connected: `Connect`
- connected with username: show username + `Disconnect`
- connected without username: show `Connected` + `Disconnect`

### Connect Screen

The eBay connect screen should:

1. build the authorize URL
2. open it in WebView
3. watch navigation changes
4. intercept callback
5. send the returned code to the server
6. show loading while saving
7. return to Settings on success

Unlike Grailed/Depop, this flow is code-based OAuth rather than cookie or magic-link token extraction.

## Data Model

No schema migration is required for the first slice.

The existing `marketplace_connections` table is sufficient because it already supports:

- per-user unique platform connection
- encrypted token blob
- optional display username
- optional expiry timestamp

The eBay-specific stable identifier lives inside `encrypted_tokens` as `ebay_user_id`.

If later product needs require querying by eBay account identity, a dedicated plain-text column can be added in a future migration. That is not necessary for connection-only.

## Error Handling

Failure cases and expected behavior:

### OAuth callback missing code

- do not store connection
- show connection failed message

### State mismatch

- treat as invalid callback
- do not exchange code
- show connection failed message

### Token exchange failure

- do not store connection
- surface generic eBay auth failure

### `getUser` failure

- do not store connection
- surface verification failure

### `getUser` succeeds but `username` missing

- still store connection
- use `Connected` fallback in UI

### Partial persistence failure

- do not mark success in UI
- keep user on connect screen or surface retry path

## Security Notes

- keep eBay client secret on the server only
- never exchange authorization code from the mobile app directly
- require and validate `state`
- encrypt all tokens before storage using existing token crypto helpers
- avoid storing more profile data than required for connection-only

## Testing Strategy

### Automated

Server:

- unit test eBay authorize URL builder if implemented server-side
- unit test eBay token exchange helper with mocked responses
- unit test eBay `getUser` verification mapper
- integration test `POST /api/connect` for eBay success/failure paths

Mobile:

- mock-web coverage can verify eBay appears in Settings once connection rows exist
- web should not pretend to complete real eBay OAuth; use mocked connection state only

### Manual

Required before calling the feature done:

1. Open eBay connect from Settings
2. Complete real eBay consent flow
3. Return to app successfully
4. Confirm Settings shows eBay connected
5. Relaunch app and confirm persistence
6. Disconnect and confirm state resets

## Out of Scope

This design does not include:

- eBay listing publish
- eBay delist
- eBay status sync
- business policies
- seller opt-in / seller readiness checks
- category aspect discovery
- token refresh worker logic beyond storing refresh token
- token revocation on disconnect

## Follow-On Work

After this slice is proven, the next eBay spec should cover:

1. seller readiness and required policy checks
2. business policy selection/storage
3. category/aspect requirements
4. inventory/offer creation and publish
5. eBay-specific error handling and retry semantics
