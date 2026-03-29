import { test, expect } from "@playwright/test";
import { seedListing } from "./helpers";

test.describe("Listing Detail", () => {
  test("loads and shows all seeded fields", async ({ page, request }) => {
    const listing = await seedListing(request);
    await page.goto(`/listing/${listing.id}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Nike Air Force 1")).toBeVisible({ timeout: 8000 });
    const priceInput = page.getByRole("textbox").nth(1);
    await expect(priceInput).toHaveValue("120");
    await expect(page.getByText(/Nike/i)).toBeVisible();
  });

  test("navigates to detail by tapping a dashboard card", async ({ page, request }) => {
    const listing = await seedListing(request);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByText(listing.title).first().click({ force: true });
    await page.waitForURL(`**/listing/${listing.id}`, { timeout: 12000 });
    await expect(page.getByText("Nike Air Force 1")).toBeVisible();
  });

  test("edits title and persists on reload", async ({ page, request }) => {
    const listing = await seedListing(request);
    await page.goto(`/listing/${listing.id}`);
    await page.waitForLoadState("networkidle");

    // Title is the first textbox in the form
    const titleInput = page.getByRole("textbox").first();
    await titleInput.clear();
    await titleInput.fill("Nike AF1 White");
    await titleInput.press("Tab"); // commit React controlled input state

    // Save via the header Save button
    await page.getByText("Save").click();
    await page.waitForLoadState("networkidle");

    // Reload and verify it persisted
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Nike AF1 White")).toBeVisible({ timeout: 6000 });
  });

  test("edits price and persists on reload", async ({ page, request }) => {
    const listing = await seedListing(request);
    await page.goto(`/listing/${listing.id}`);
    await page.waitForLoadState("networkidle");

    // Price is the second textbox in the form (Title, Price, Brand, Size, Category order)
    const priceInput = page.getByRole("textbox").nth(1);
    await priceInput.clear();
    await priceInput.fill("150");
    await priceInput.press("Tab"); // commit React controlled input state

    await page.getByText("Save").click();
    await page.waitForLoadState("networkidle");

    await page.reload();
    await page.waitForLoadState("networkidle");
    const priceInputAfter = page.getByRole("textbox").nth(1);
    await expect(priceInputAfter).toHaveValue("150");
  });

  test("shows Grailed and Depop platform rows", async ({ page, request }) => {
    const listing = await seedListing(request);
    await page.goto(`/listing/${listing.id}`);
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/grailed/i)).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/depop/i)).toBeVisible({ timeout: 8000 });
  });
});
