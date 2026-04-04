import { expect, type APIRequestContext, type Page } from "@playwright/test";

const API_URL = process.env.E2E_API_URL ?? (process.env.E2E_BASE_URL ? new URL(process.env.E2E_BASE_URL).origin : undefined);
const EBAY_SANDBOX = ["1", "true", "yes", "on"].includes((process.env.E2E_EBAY_SANDBOX ?? "true").toLowerCase());
const EBAY_AUTH_HOST = EBAY_SANDBOX ? "https://auth.sandbox.ebay.com" : "https://auth.ebay.com";
const EBAY_SCOPE = "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly";
const EBAY_CALLBACK_HOST = process.env.E2E_EBAY_CALLBACK_HOST ?? "https://vibelyster.vercel.app";

if (!API_URL) {
  throw new Error("E2E_BASE_URL is required for live helpers.");
}

type Listing = {
  id: string;
  title: string;
  price: string;
  description?: string;
  voice_transcript?: string | null;
};

const LISTING_FIXTURE = {
  title: `E2E Listing ${Date.now()}`,
  description: "Created by Playwright against the deployed preview.",
  price: 120,
  size: "10",
  condition: "gently_used",
  brand: "Nike",
  category: "sneakers",
  photos: ["https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80"],
};

export async function getClerkToken(page: Page) {
  if (page.url() === "about:blank") {
    await page.goto("/");
  }

  await page.waitForFunction(() => Boolean((window as any).Clerk?.session), undefined, {
    timeout: 30_000,
  });

  const token = await page.evaluate(async () => {
    const clerk = (window as any).Clerk;
    return clerk?.session ? clerk.session.getToken() : null;
  });

  expect(token).toBeTruthy();
  return token as string;
}

async function api<T>(request: APIRequestContext, token: string, method: string, path: string, data?: unknown): Promise<T> {
  const res = await request.fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    data,
  });

  if (!res.ok) {
    throw new Error(`${method} ${path} failed: ${res.status()} ${await res.text()}`);
  }

  if (res.status() === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export async function createListing(page: Page, request: APIRequestContext, overrides: Record<string, unknown> = {}) {
  const token = await getClerkToken(page);
  return api<Listing>(request, token, "POST", "/api/listings", { ...LISTING_FIXTURE, ...overrides });
}

export async function deleteListing(page: Page, request: APIRequestContext, listingId: string) {
  const token = await getClerkToken(page);
  await api<void>(request, token, "DELETE", `/api/listings/${listingId}`);
}

export async function generateListingDraft(
  page: Page,
  request: APIRequestContext,
  params: { transcript?: string; photoUrls?: string[] }
) {
  const token = await getClerkToken(page);
  const multipart: Record<string, string> = {};

  if (params.photoUrls?.length) {
    multipart.photos = params.photoUrls.join(",");
  }
  if (params.transcript?.trim()) {
    multipart.transcript = params.transcript.trim();
  }

  const res = await request.fetch(`${API_URL}/api/generate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    multipart,
  });

  if (!res.ok) {
    throw new Error(`POST /api/generate failed: ${res.status()} ${await res.text()}`);
  }

  return (await res.json()) as { listing: Listing };
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for live eBay OAuth tests.`);
  return value;
}

function buildEbayAuthorizeUrl(state: string) {
  const clientId = process.env.E2E_EBAY_CLIENT_ID ?? process.env.EXPO_PUBLIC_EBAY_CLIENT_ID;
  const ruName = process.env.E2E_EBAY_RU_NAME ?? process.env.EXPO_PUBLIC_EBAY_RU_NAME;
  if (!clientId || !ruName) {
    throw new Error("E2E_EBAY_CLIENT_ID/E2E_EBAY_RU_NAME (or EXPO_PUBLIC_* equivalents) are required.");
  }

  const url = new URL(`${EBAY_AUTH_HOST}/oauth2/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", ruName);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", EBAY_SCOPE);
  url.searchParams.set("state", state);
  return { url: url.toString(), ruName };
}

export async function captureEbaySandboxAuthorizationCode(page: Page) {
  const providedAuthorizationCode = process.env.E2E_EBAY_AUTH_CODE;
  const { ruName } = buildEbayAuthorizeUrl(`pw-ebay-${Date.now()}`);
  if (providedAuthorizationCode) {
    return { authorizationCode: providedAuthorizationCode, ruName };
  }

  const username = required("E2E_EBAY_SANDBOX_USERNAME");
  const password = required("E2E_EBAY_SANDBOX_PASSWORD");
  const state = `pw-ebay-${Date.now()}`;
  const { url } = buildEbayAuthorizeUrl(state);

  await page.goto(url);
  await page.getByLabel(/email or username/i).fill(username);
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /^sign in$/i }).click();

  const callbackUrlPredicate = (currentUrl: URL) => {
    const value = currentUrl.toString();
    return value.startsWith(`${EBAY_CALLBACK_HOST}/api/ebay/callback`) || value.startsWith("vibelyster://connect/ebay");
  };

  const agreeButton = page.getByRole("button", { name: /agree and continue/i });
  const reachedCallbackAfterSignIn = await page
    .waitForURL(callbackUrlPredicate, { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);

  if (!reachedCallbackAfterSignIn) {
    await agreeButton.waitFor({ state: "visible", timeout: 20_000 });
    await agreeButton.scrollIntoViewIfNeeded().catch(() => undefined);
    await agreeButton.click();
  }

  await page.waitForURL(callbackUrlPredicate, { timeout: 60_000 });

  const deepLink = new URL(page.url());
  const authorizationCode = deepLink.searchParams.get("code");
  expect(authorizationCode).toBeTruthy();
  expect(deepLink.searchParams.get("state")).toBe(state);

  return { authorizationCode: authorizationCode as string, ruName };
}

export async function connectEbayThroughApi(
  request: APIRequestContext,
  token: string,
  input: { authorizationCode: string; ruName: string },
) {
  return api<{
    platform: "ebay";
    platform_username: string | null;
    expires_at: string | null;
  }>(request, token, "POST", "/api/connect", {
    platform: "ebay",
    authorizationCode: input.authorizationCode,
    ruName: input.ruName,
  });
}

export async function getConnectionsViaApi(request: APIRequestContext, token: string) {
  return api<Array<{ platform: string; platform_username: string | null }>>(request, token, "GET", "/api/connections");
}

export async function disconnectPlatformViaApi(request: APIRequestContext, token: string, platform: "ebay") {
  const response = await request.fetch(`${API_URL}/api/connect?platform=${platform}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok() && response.status() !== 404) {
    throw new Error(`DELETE /api/connect failed: ${response.status()} ${await response.text()}`);
  }
}
