import { test, expect } from "@playwright/test";
import { createListing, deleteListing } from "./live-helpers";

test.describe("Preview smoke", () => {
  test("signed-in user can open dashboard and settings", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/closet command|no listings yet|drafts/i).first()).toBeVisible({ timeout: 30_000 });

    await page.getByText(/settings/i).click();
    await expect(page.getByText(/account & connections/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/sign out/i)).toBeVisible({ timeout: 15_000 });
  });

  test("can create a listing via API and edit it in the deployed UI", async ({ page, request }) => {
    const uniqueTitle = `E2E Preview ${Date.now()}`;
    const listing = await createListing(page, request, { title: uniqueTitle, price: 120 });

    try {
      await page.goto(`/listing/${listing.id}`);
      await expect(page.getByText(uniqueTitle)).toBeVisible({ timeout: 30_000 });

      const titleInput = page.getByRole("textbox").first();
      await titleInput.click({ clickCount: 3 });
      await titleInput.pressSequentially(`${uniqueTitle} Updated`);
      await expect(titleInput).toHaveValue(`${uniqueTitle} Updated`);

      const priceInput = page.getByRole("textbox").nth(1);
      await priceInput.click({ clickCount: 3 });
      await priceInput.pressSequentially("150");
      await expect(priceInput).toHaveValue("150");

      const saveResponse = page.waitForResponse(
        (r) => r.url().includes(`/api/listings/${listing.id}`) && r.request().method() === "PUT"
      );
      await page.getByText(/^save$/i).click();
      await saveResponse;

      await page.reload();
      await expect(page.getByText(`${uniqueTitle} Updated`)).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("textbox").nth(1)).toHaveValue("150");
    } finally {
      await deleteListing(page, request, listing.id).catch(() => undefined);
    }
  });

  test("can delete a listing from the deployed UI", async ({ page, request }) => {
    const uniqueTitle = `E2E Delete ${Date.now()}`;
    const listing = await createListing(page, request, { title: uniqueTitle, price: 80 });

    await page.goto(`/listing/${listing.id}`);
    await expect(page.getByText(uniqueTitle)).toBeVisible({ timeout: 30_000 });

    const deleteResponse = page.waitForResponse(
      (r) => r.url().includes(`/api/listings/${listing.id}`) && r.request().method() === "DELETE"
    );
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByText(/delete listing/i).click();
    await deleteResponse;

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(uniqueTitle)).not.toBeVisible({ timeout: 10_000 });
  });
});
