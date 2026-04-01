import { test, expect } from "@playwright/test";
import { deleteListing, generateListingDraft } from "./live-helpers";

const PHOTO_URL = "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80";

test.describe("Manual AI generate", () => {
  test("can generate a draft from transcript + image without audio", async ({ page, request }) => {
    const transcript = `Manual AI test ${Date.now()} Nike Air Force 1 size 10 gently used asking 120`;
    const result = await generateListingDraft(page, request, {
      transcript,
      photoUrls: [PHOTO_URL],
    });

    try {
      await page.goto(`/listing/${result.listing.id}`);
      await expect(page.getByText(/edit details and publish to marketplaces/i)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole("textbox").first()).not.toHaveValue("", { timeout: 15_000 });

      const description = page.getByRole("textbox").nth(4);
      await expect(description).not.toHaveValue("", { timeout: 15_000 });
      await expect(description).toBeVisible();
    } finally {
      await deleteListing(page, request, result.listing.id).catch(() => undefined);
    }
  });

  test("can generate a draft from transcript only without image or audio", async ({ page, request }) => {
    const transcript = `Manual text-only test ${Date.now()} vintage Levi's 501 jeans size 32 good condition asking 95 dollars`;
    const result = await generateListingDraft(page, request, {
      transcript,
    });

    try {
      await page.goto(`/listing/${result.listing.id}`);
      await expect(page.getByText(/edit details and publish to marketplaces/i)).toBeVisible({ timeout: 30_000 });

      const titleInput = page.getByRole("textbox").first();
      const priceInput = page.getByRole("textbox").nth(1);
      const descriptionInput = page.getByRole("textbox").nth(4);

      await expect(titleInput).not.toHaveValue("", { timeout: 15_000 });
      await expect(priceInput).not.toHaveValue("", { timeout: 15_000 });
      await expect(descriptionInput).not.toHaveValue("", { timeout: 15_000 });
    } finally {
      await deleteListing(page, request, result.listing.id).catch(() => undefined);
    }
  });
});
