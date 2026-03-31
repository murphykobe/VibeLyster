import { expect, type APIRequestContext, type Page } from "@playwright/test";

const API_URL = process.env.E2E_API_URL ?? (process.env.E2E_BASE_URL ? new URL(process.env.E2E_BASE_URL).origin : undefined);

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
