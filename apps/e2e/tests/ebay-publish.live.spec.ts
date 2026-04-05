import { test, expect } from "@playwright/test";
import {
  captureEbaySandboxAuthorizationCode,
  connectEbayThroughApi,
  createListing,
  disconnectPlatformViaApi,
  getClerkToken,
  publishListingViaApi,
} from "./live-helpers";

test.describe("eBay publish live smoke", () => {
  test("publishes a single listing to ebay sandbox through the live api", async ({ page, request }) => {
    await page.goto("/");
    const token = await getClerkToken(page);

    await disconnectPlatformViaApi(request, token, "ebay");
    const { authorizationCode, ruName } = await captureEbaySandboxAuthorizationCode(page);
    await connectEbayThroughApi(request, token, { authorizationCode, ruName });

    const listing = await createListing(page, request, {
      title: `Live eBay publish ${Date.now()}`,
      category: "tops.hoodie",
      brand: "Nike",
      size: "M",
      traits: {
        color: "Black",
        department: "Men",
        material: "Cotton",
      },
    });

    const data = await publishListingViaApi(request, token, {
      listingId: listing.id,
      mode: "draft",
    });

    expect(data.results.ebay).toBeTruthy();
    const ebayResult = data.results.ebay as {
      ok: boolean;
      remoteState?: string;
      error?: string;
    };

    expect(ebayResult.ok, ebayResult.error ?? "Expected eBay publish to succeed").toBe(true);
    expect(ebayResult.remoteState).toBe("draft");
  });
});
