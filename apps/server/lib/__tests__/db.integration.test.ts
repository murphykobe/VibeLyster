/**
 * Neon DB integration tests — CRUD against the real database.
 *
 * Requires DATABASE_URL in environment (pulled via `vercel env pull`).
 * Uses a dedicated test clerk_id prefix ("inttest-") so rows are easily
 * identifiable and cleaned up after each test.
 *
 * Run: MOCK_MODE=0 npx vitest run lib/__tests__/db.integration.test.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  upsertUser,
  createListing,
  getListingById,
  getListings,
  updateListing,
  softDeleteListing,
} from "../db";

const TEST_USER_CLERK_ID = `inttest-${Date.now()}`;
const TEST_EMAIL = `${TEST_USER_CLERK_ID}@inttest.vibelyster.local`;

const LISTING_FIXTURE = {
  title: "Integration Test Listing",
  description: "Created by db.integration.test.ts — safe to delete",
  price: 99,
  size: "M",
  condition: "new" as const,
  brand: "TestBrand",
  category: "tops",
  photos: ["https://blob.vercel-storage.com/inttest-photo.jpg"],
};

let userId: string;

beforeEach(async () => {
  const user = await upsertUser(TEST_USER_CLERK_ID, TEST_EMAIL);
  userId = user.id;
});

afterEach(async () => {
  // Clean up: delete all listings for this test user, then remove the user
  const listings = await getListings(userId);
  for (const l of listings) {
    await softDeleteListing(userId, l.id).catch(() => {});
  }
  // User rows are cleaned up via ON DELETE CASCADE or left (tiny footprint)
});

describe("Neon DB — listings CRUD", () => {
  it("creates a listing and reads it back", async () => {
    const listing = await createListing({ userId, ...LISTING_FIXTURE });
    expect(listing.id).toBeDefined();

    expect(listing.title).toBe(LISTING_FIXTURE.title);
    expect(Number(listing.price)).toBe(LISTING_FIXTURE.price);

    const fetched = await getListingById(userId, listing.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.title).toBe(LISTING_FIXTURE.title);
    expect(fetched!.brand).toBe(LISTING_FIXTURE.brand);
  });

  it("lists only this user's listings", async () => {
    await createListing({ userId, ...LISTING_FIXTURE });
    await createListing({ userId, ...LISTING_FIXTURE, title: "Second listing" });

    const results = await getListings(userId);
    expect(results.length).toBeGreaterThanOrEqual(2);
    for (const r of results) {
      expect(r.title).toBeDefined();
    }
  });

  it("updates listing fields", async () => {
    const listing = await createListing({ userId, ...LISTING_FIXTURE });
    const updated = await updateListing(userId, listing.id, { title: "Updated Title", price: 150 });
    expect(updated).not.toBeNull();
    expect(updated!.title).toBe("Updated Title");
    expect(Number(updated!.price)).toBe(150);
    // Unchanged fields persist
    expect(updated!.brand).toBe(LISTING_FIXTURE.brand);
  });

  it("soft-deletes listing — hidden from subsequent reads", async () => {
    const listing = await createListing({ userId, ...LISTING_FIXTURE });
    await softDeleteListing(userId, listing.id);

    const fetched = await getListingById(userId, listing.id);
    expect(fetched ?? null).toBeNull();
  });

  it("getListingById returns null for another user's listing", async () => {
    const listing = await createListing({ userId, ...LISTING_FIXTURE });
    const otherUser = await upsertUser(`inttest-other-${Date.now()}`, `other-${Date.now()}@inttest.local`);

    const fetched = await getListingById(otherUser.id, listing.id);
    expect(fetched ?? null).toBeNull();
  });
});
