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

    // Wait for entrance animations to settle, then target the Pressable (role=button)
    // directly — clicking on the inner Text node doesn't reliably fire onPress in CI.
    await page.waitForTimeout(800);
    await page.getByRole("button").filter({ hasText: listing.title }).first().click();
    await page.waitForURL(`**/listing/${listing.id}`, { timeout: 12000 });
    await expect(page.getByText("Nike Air Force 1")).toBeVisible();
  });

  test("edits title and persists on reload", async ({ page, request }) => {
    const listing = await seedListing(request);
    await page.goto(`/listing/${listing.id}`);
    await page.waitForLoadState("networkidle");

    // Title is the first textbox in the form.
    // pressSequentially types char-by-char (keydown/input/keyup per char), which is
    // more reliable than fill() for React Native Web controlled inputs.
    const titleInput = page.getByRole("textbox").first();
    await titleInput.click({ clickCount: 3 }); // select all existing text
    await titleInput.pressSequentially("Nike AF1 White");
    await expect(titleInput).toHaveValue("Nike AF1 White", { timeout: 3000 });

    // Save and wait for the PUT to complete before reloading
    const saveResponse = page.waitForResponse(
      (r) => r.url().includes("/api/listings/") && r.request().method() === "PUT"
    );
    await page.getByText("Save").click();
    await saveResponse;

    // Reload and verify it persisted
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Nike AF1 White")).toBeVisible({ timeout: 6000 });
  });

  test("edits price and persists on reload", async ({ page, request }) => {
    const listing = await seedListing(request);
    await page.goto(`/listing/${listing.id}`);
    await page.waitForLoadState("networkidle");

    // Price is the second textbox in the form (Title, Price, Brand, Size, Category order).
    // Use pressSequentially for inputmode="decimal" — fill() alone doesn't reliably
    // update the React controlled state for this input type in CI headless Chromium.
    const priceInput = page.getByRole("textbox").nth(1);
    await priceInput.click({ clickCount: 3 }); // select all existing text
    await priceInput.pressSequentially("150");
    await expect(priceInput).toHaveValue("150", { timeout: 3000 });

    // Save and wait for the PUT to complete before reloading
    const saveResponse = page.waitForResponse(
      (r) => r.url().includes("/api/listings/") && r.request().method() === "PUT"
    );
    await page.getByText("Save").click();
    await saveResponse;

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
