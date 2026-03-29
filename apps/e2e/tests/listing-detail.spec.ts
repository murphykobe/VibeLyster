import { test, expect } from "@playwright/test";
import { seedListing } from "./helpers";

test.describe("Listing Detail", () => {
  test("loads and shows all seeded fields", async ({ page, request }) => {
    const listing = await seedListing(request);
    await page.goto(`/listing/${listing.id}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Nike Air Force 1")).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/\$120/)).toBeVisible();
    await expect(page.getByText(/Nike/i)).toBeVisible();
  });

  test("navigates to detail by tapping a dashboard card", async ({ page, request }) => {
    const listing = await seedListing(request);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByText("Nike Air Force 1").click();
    await page.waitForURL(`**/listing/${listing.id}`, { timeout: 8000 });
    await expect(page.getByText("Nike Air Force 1")).toBeVisible();
  });

  test("edits title and persists on reload", async ({ page, request }) => {
    const listing = await seedListing(request);
    await page.goto(`/listing/${listing.id}`);
    await page.waitForLoadState("networkidle");

    // Find the title field and update it
    const titleInput = page.getByDisplayValue("Nike Air Force 1");
    await titleInput.clear();
    await titleInput.fill("Nike AF1 White");
    // Trigger save (blur or save button)
    await titleInput.press("Tab");
    await page.waitForTimeout(500);

    // Reload and verify it persisted
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Nike AF1 White")).toBeVisible({ timeout: 6000 });
  });

  test("edits price and persists on reload", async ({ page, request }) => {
    const listing = await seedListing(request);
    await page.goto(`/listing/${listing.id}`);
    await page.waitForLoadState("networkidle");

    const priceInput = page.getByDisplayValue("120");
    await priceInput.clear();
    await priceInput.fill("150");
    await priceInput.press("Tab");
    await page.waitForTimeout(500);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/\$150/)).toBeVisible({ timeout: 6000 });
  });

  test("shows Grailed and Depop platform rows", async ({ page, request }) => {
    const listing = await seedListing(request);
    await page.goto(`/listing/${listing.id}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/grailed/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/depop/i)).toBeVisible({ timeout: 8000 });
  });
});
