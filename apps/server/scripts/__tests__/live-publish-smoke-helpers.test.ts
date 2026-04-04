import { describe, expect, it } from "vitest";
import {
  buildGrailedDraftPayload,
  mapGrailedDraftCategory,
} from "../live-publish-smoke-helpers.mjs";

describe("mapGrailedDraftCategory", () => {
  it("maps canonical sneakers to Grailed low-top sneakers", () => {
    expect(mapGrailedDraftCategory("footwear.sneakers")).toBe("footwear.lowtop_sneakers");
  });

  it("returns null for unsupported categories", () => {
    expect(mapGrailedDraftCategory("unsupported.other")).toBeNull();
  });
});

describe("buildGrailedDraftPayload", () => {
  it("builds a draft-safe Grailed payload from a canonical listing", () => {
    const payload = buildGrailedDraftPayload({
      listing: {
        title: "Smoke Test CLI Nike Sneakers",
        description: "Smoke test listing created by live-publish-smoke.mjs",
        price: "120",
        size: "10",
        condition: "gently_used",
        category: "footwear.sneakers",
        traits: { color: "black", country_of_origin: "US" },
      },
      designer: { id: 30, name: "Nike", slug: "nike" },
      uploadedPhotoUrls: ["https://media-assets.grailed.com/prd/listing/temp/test-photo"],
    });

    expect(payload).toMatchObject({
      category_path: "footwear.lowtop_sneakers",
      price: 120,
      department: "menswear",
      make_offer: true,
      buy_now: true,
      designers: [{ id: 30, name: "Nike", slug: "nike" }],
      photos: [
        {
          url: "https://media-assets.grailed.com/prd/listing/temp/test-photo",
          position: 0,
        },
      ],
      traits: [
        { name: "color", value: "black" },
        { name: "country_of_origin", value: "US" },
      ],
    });
  });

  it("rejects unsupported categories before attempting draft creation", () => {
    expect(() =>
      buildGrailedDraftPayload({
        listing: {
          title: "Car",
          description: "Definitely unsupported",
          price: "120",
          size: null,
          condition: "used",
          category: "unsupported.other",
          traits: {},
        },
        designer: { id: 30, name: "Nike", slug: "nike" },
        uploadedPhotoUrls: ["https://media-assets.grailed.com/prd/listing/temp/test-photo"],
      })
    ).toThrow(/unsupported grailed draft category/i);
  });
});
