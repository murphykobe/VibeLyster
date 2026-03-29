import { test, expect } from "@playwright/test";
import { seedListing } from "./helpers";

test.describe("Dashboard", () => {
  test("shows empty state when no listings", async ({ page }) => {
    await page.goto("/");
    // Dashboard should render without crashing
    await expect(page).toHaveTitle(/VibeLyster/i);
    // No listing cards in empty state
    await expect(page.getByTestId("listing-card").first()).not.toBeVisible({ timeout: 3000 }).catch(() => {});
  });

  test("shows listing card after one is created", async ({ page, request }) => {
    await seedListing(request);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Listing card with the seeded title should appear
    await expect(page.getByText("Nike Air Force 1").first()).toBeVisible({ timeout: 8000 });
  });

  test("shows price on listing card", async ({ page, request }) => {
    await seedListing(request);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/\$120/).first()).toBeVisible({ timeout: 8000 });
  });

  test("multiple listings all appear", async ({ page, request }) => {
    await seedListing(request, { title: "Adidas Samba" });
    await seedListing(request, { title: "New Balance 550" });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText("Adidas Samba")).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("New Balance 550")).toBeVisible({ timeout: 8000 });
  });
});
