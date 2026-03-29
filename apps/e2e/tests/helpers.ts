import type { APIRequestContext } from "@playwright/test";

const API = "http://localhost:3001";
const MOCK_HEADERS = { "x-mock-user-id": "e2e-user", "content-type": "application/json" };

const LISTING_FIXTURE = {
  title: "Nike Air Force 1",
  description: "Clean pair of AF1s, barely worn.",
  price: 120,
  size: "10",
  condition: "gently_used",
  brand: "Nike",
  category: "sneakers",
  photos: ["https://blob.vercel-storage.com/test-photo.jpg"],
};

export async function seedListing(request: APIRequestContext, overrides: Record<string, unknown> = {}) {
  const res = await request.post(`${API}/api/listings`, {
    headers: MOCK_HEADERS,
    data: { ...LISTING_FIXTURE, ...overrides },
  });
  return (await res.json()) as { id: string; title: string; price: string };
}

export async function seedConnection(request: APIRequestContext, platform: "grailed" | "depop") {
  const tokens =
    platform === "grailed"
      ? { csrf_token: "mock-csrf", cookies: "session=mock" }
      : { access_token: "mock-token" };
  await request.post(`${API}/api/connect`, {
    headers: MOCK_HEADERS,
    data: { platform, tokens },
  });
}

export async function seedPublishedListing(request: APIRequestContext) {
  const listing = await seedListing(request);
  await seedConnection(request, "grailed");
  await request.post(`${API}/api/publish`, {
    headers: MOCK_HEADERS,
    data: { listingId: listing.id, platforms: ["grailed"] },
  });
  return listing;
}
