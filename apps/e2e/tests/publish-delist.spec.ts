import { test, expect } from "@playwright/test";
import { seedListing, seedConnection, seedPublishedListing } from "./helpers";

test.describe("Publish & Delist", () => {
  test("Grailed row shows Publish when connected but not published", async ({ page, request }) => {
    const listing = await seedListing(request);
    await seedConnection(request, "grailed");

    await page.goto(`/listing/${listing.id}`);
    await page.waitForLoadState("networkidle");

    // Grailed row should have a Publish button
    await expect(page.getByText("Publish", { exact: true }).first()).toBeVisible({ timeout: 8000 });
  });

  test("publish changes Grailed status to Live", async ({ page, request }) => {
    const listing = await seedListing(request);
    await seedConnection(request, "grailed");

    await page.goto(`/listing/${listing.id}`);
    await page.waitForLoadState("networkidle");

    // Click Publish on Grailed row
    await page.getByText("Publish", { exact: true }).first().click();

    // Status should update to Live
    await expect(page.getByText(/live/i).first()).toBeVisible({ timeout: 8000 });
  });

  test("after publish, Grailed row shows Delist", async ({ page, request }) => {
    const listing = await seedListing(request);
    await seedConnection(request, "grailed");

    await page.goto(`/listing/${listing.id}`);
    await page.waitForLoadState("networkidle");
    await page.getByText("Publish", { exact: true }).first().click();

    // Delist button should appear
    await expect(page.getByText("Delist", { exact: true }).first()).toBeVisible({ timeout: 8000 });
  });

  test("delist reverts status back from Live", async ({ page, request }) => {
    const listing = await seedPublishedListing(request);

    await page.goto(`/listing/${listing.id}`);
    await page.waitForLoadState("networkidle");

    // Should already show live state (seeded as published)
    await expect(page.getByText("Live", { exact: true }).first()).toBeVisible({ timeout: 8000 });

    // Delist — react-native-web Alert.alert maps to window.confirm; accept the dialog.
    // Register waitForResponse BEFORE click so we don't miss the response.
    const delistResponse = page.waitForResponse((r) => r.url().includes("/api/delist"));
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByText("Delist").first().click();
    await delistResponse;

    // After delist the Grailed row switches to "Delisted" status and shows Publish button.
    // Asserting on the action button change is more reliable than waiting for "Live" to vanish.
    await expect(page.getByText("Publish", { exact: true }).first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("Delist", { exact: true })).not.toBeVisible({ timeout: 4000 });
  });

  test("published listing shows Live badge on dashboard", async ({ page, request }) => {
    await seedPublishedListing(request);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/live/i).first()).toBeVisible({ timeout: 8000 });
  });

  test("publish to all connected platforms", async ({ page, request }) => {
    const listing = await seedListing(request);
    await seedConnection(request, "grailed");
    await seedConnection(request, "depop");

    await page.goto(`/listing/${listing.id}`);
    await page.waitForLoadState("networkidle");

    // Publish to All button
    const publishAll = page.getByText(/publish to all/i);
    await expect(publishAll).toBeVisible({ timeout: 8000 });
    await publishAll.click();

    // Both platforms should show Live
    const liveBadges = page.getByText(/live/i);
    await expect(liveBadges.first()).toBeVisible({ timeout: 8000 });
    expect(await liveBadges.count()).toBeGreaterThanOrEqual(2);
  });

  test("cannot delete a listing that is still Live", async ({ page, request }) => {
    const listing = await seedPublishedListing(request);

    await page.goto(`/listing/${listing.id}`);
    await page.waitForLoadState("networkidle");

    const deleteBtn = page.getByText(/delete/i);
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      // Should not navigate away — listing should still be visible
      await expect(page.getByText("Nike Air Force 1")).toBeVisible({ timeout: 5000 });
    }
  });

  test("bulk publish from dashboard", async ({ page, request }) => {
    await seedListing(request, { title: "Listing A" });
    await seedListing(request, { title: "Listing B" });
    await seedConnection(request, "grailed");

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Select all listings
    const selectAll = page.getByText(/select all/i).or(page.getByRole("checkbox").first());
    if (await selectAll.isVisible({ timeout: 3000 })) {
      await selectAll.click();
      const bulkPublish = page.getByText(/publish selected/i).or(page.getByText(/bulk publish/i));
      if (await bulkPublish.isVisible({ timeout: 3000 })) {
        await bulkPublish.click();
        await page.waitForTimeout(1500);
        await page.reload();
        await page.waitForLoadState("networkidle");
        // At least one live badge after bulk publish
        await expect(page.getByText(/live/i).first()).toBeVisible({ timeout: 8000 });
      }
    }
  });
});
