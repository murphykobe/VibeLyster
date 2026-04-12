import { describe, expect, it, vi } from "vitest";
import { publishToEbay } from "../ebay-publish";

const TOKENS = {
  access_token: "token",
  refresh_token: "refresh",
  token_type: "Bearer",
  ebay_user_id: "user-1",
  expires_at: new Date(Date.now() + 3600_000).toISOString(),
};

const LISTING = {
  id: "listing-1",
  title: "Nike Hoodie",
  description: "Black Nike hoodie, size M",
  price: 80,
  size: "M",
  condition: "gently_used",
  brand: "Nike",
  category: "tops.hoodie",
  traits: { color: "Black", department: "Men" },
  photos: ["https://example.com/hoodie.jpg"],
};

describe("publishToEbay", () => {
  it("creates an eBay draft when mode=draft", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ offerId: "offer-1", listingId: "listing-remote-1" }), { status: 200 })
    );

    const result = await publishToEbay(LISTING, TOKENS, {
      mode: "draft",
      metadata: {
        ebayCategoryId: "155183",
        ebayConditionId: 3000,
        ebayListingFormat: "FIXED_PRICE",
        ebayAspects: { Brand: ["Nike"], Department: ["Men"], Size: ["M"], "Size Type": ["Regular"] },
        validationStatus: "valid",
      },
      sellerReadiness: {
        ready: true,
        missing: [],
        policies: {
          payment: { id: "pp-1", name: "Pay" },
          fulfillment: { id: "fp-1", name: "Ship" },
          return: { id: "rp-1", name: "Return" },
        },
        checkedAt: new Date().toISOString(),
      },
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.remoteState).toBe("draft");
      expect(result.modeUsed).toBe("draft");
      expect(result.platformListingId).toBe("listing-remote-1");
      expect(result.platformData).toMatchObject({
        debug: {
          requests: [
            {
              operation: "upsert_offer",
              method: "POST",
              endpoint: "/sell/inventory/v1/offer",
            },
          ],
        },
      });
    }
  });
});
