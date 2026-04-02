import { describe, expect, it } from "vitest";
import {
  coerceCategoryForStorage,
  mapCanonicalCategoryToDepop,
  mapCanonicalCategoryToGrailed,
  normalizeCanonicalCategory,
} from "../categories";

describe("normalizeCanonicalCategory", () => {
  it("preserves canonical keys", () => {
    expect(normalizeCanonicalCategory("footwear.sneakers")).toBe("footwear.sneakers");
  });

  it("prefers more specific aliases before generic substring matches", () => {
    expect(normalizeCanonicalCategory("sweatshirt")).toBe("tops.hoodie");
    expect(normalizeCanonicalCategory("Vintage sweatshirt")).toBe("tops.hoodie");
  });

  it("normalizes legacy aliases into canonical keys", () => {
    expect(normalizeCanonicalCategory("sneakers")).toBe("footwear.sneakers");
    expect(normalizeCanonicalCategory("Leather Jacket")).toBe("outerwear.jacket");
  });
});

describe("coerceCategoryForStorage", () => {
  it("allows explicit unsupported category key", () => {
    expect(coerceCategoryForStorage("unsupported.other")).toEqual({
      ok: true,
      category: "unsupported.other",
    });
  });

  it("rejects unsupported item aliases like cars", () => {
    expect(coerceCategoryForStorage("car")).toEqual({
      ok: false,
      error: "This item category is not supported for marketplace publishing yet.",
    });
  });

  it("treats blank values as clearing the category", () => {
    expect(coerceCategoryForStorage("")).toEqual({ ok: true, category: null });
    expect(coerceCategoryForStorage(null)).toEqual({ ok: true, category: null });
  });
});

describe("platform category mappings", () => {
  it("maps supported canonical keys to Grailed and Depop taxonomies", () => {
    expect(mapCanonicalCategoryToGrailed("footwear.sneakers")).toBe("footwear.sneakers");
    expect(mapCanonicalCategoryToDepop("footwear.sneakers")).toEqual({
      group: "shoes",
      productType: "trainers",
    });
  });

  it("returns null for unsupported canonical categories", () => {
    expect(mapCanonicalCategoryToGrailed("unsupported.other")).toBeNull();
    expect(mapCanonicalCategoryToDepop("unsupported.other")).toBeNull();
  });
});
