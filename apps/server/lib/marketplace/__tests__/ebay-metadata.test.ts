import { describe, expect, it, vi } from "vitest";
import { buildEbayListingMetadata } from "../ebay-metadata";

const LISTING = {
  id: "listing-1",
  title: "Nike Hoodie",
  description: "Black Nike hoodie, size M",
  price: 80,
  size: "M",
  condition: "gently_used",
  brand: "Nike",
  category: "tops.hoodie",
  traits: { color: "Black", material: "Cotton", department: "Men" },
  photos: ["https://example.com/hoodie.jpg"],
};

describe("buildEbayListingMetadata", () => {
  it("maps supported apparel fields deterministically without calling AI", async () => {
    const generateFallback = vi.fn();
    const result = await buildEbayListingMetadata({ listing: LISTING, generateFallback });

    expect(result.metadata.ebayCategoryId).toBeTruthy();
    expect(result.metadata.ebayConditionId).toBeTruthy();
    expect(result.metadata.ebayAspects?.Brand).toEqual(["Nike"]);
    expect(result.metadata.validationStatus).toBe("valid");
    expect(generateFallback).not.toHaveBeenCalled();
  });

  it("calls AI only for missing aspects and marks those fields as ai-generated", async () => {
    const generateFallback = vi.fn().mockResolvedValue({
      Material: ["Leather"],
      Department: ["Men"],
    });

    const result = await buildEbayListingMetadata({
      listing: { ...LISTING, category: "footwear.sneakers", traits: {} },
      generateFallback,
    });

    expect(generateFallback).toHaveBeenCalledTimes(1);
    expect(result.metadata.ebayAspects?.Material).toEqual(["Leather"]);
    expect(result.metadata.metadataSources?.Material).toBe("ai");
    expect(result.metadata.metadataSources?.Department).toBe("ai");
  });
});
