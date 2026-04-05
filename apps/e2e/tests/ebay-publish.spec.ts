import { test, expect } from "@playwright/test";
import { seedListing, seedEbayConnection } from "./helpers";

test.describe("eBay publish", () => {
  test("ebay publish failure reveals editable ebay metadata section", async ({ page, request }) => {
    const listing = await seedListing(request, {
      title: "Mystery jacket",
      category: "outerwear.jacket",
      brand: "Unknown",
      traits: {},
    });
    await seedEbayConnection(request, { ready: true });

    await page.goto(`/listing/${listing.id}`);
    await page.waitForLoadState("networkidle");

    await page.getByText("Publish", { exact: true }).last().click();

    await expect(page.getByText("eBay details", { exact: true })).toBeVisible({ timeout: 8000 });
    await expect(page.getByLabel(/Department/i)).toBeVisible({ timeout: 8000 });
  });

  test("settings shows ebay readiness hint", async ({ page, request }) => {
    await seedEbayConnection(request, { ready: false, missing: ["fulfillment_policy"] });

    await page.goto("/settings");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/seller setup incomplete/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/fulfillment_policy/i)).toBeVisible({ timeout: 8000 });
  });
});
