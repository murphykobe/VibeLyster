import { test, expect } from "@playwright/test";
import { seedConnection } from "./helpers";

test.describe("Settings — Marketplace Connections", () => {
  test("shows Connect button when no platforms connected", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Navigate to settings tab
    await page.getByText(/settings/i).click();
    await page.waitForLoadState("networkidle");

    // Both platforms show "Connect" (or similar unconnected state)
    const connectBtns = page.getByText(/connect/i);
    await expect(connectBtns.first()).toBeVisible({ timeout: 8000 });
  });

  test("shows Connected after seeding a Grailed connection", async ({ page, request }) => {
    await seedConnection(request, "grailed");
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByText(/settings/i).click();
    await page.waitForLoadState("networkidle");

    // Grailed row should show connected state
    await expect(page.getByText(/connected/i)).toBeVisible({ timeout: 8000 });
  });

  test("can connect Grailed via web mock button", async ({ page }) => {
    await page.goto("/connect/grailed");
    await page.waitForLoadState("networkidle");

    // The web stub renders a "Save Mock Connection" button in mock mode
    const saveBtn = page.getByText(/save mock connection/i);
    await expect(saveBtn).toBeVisible({ timeout: 8000 });
    await saveBtn.click();

    // Should navigate back after connecting
    await expect(page.getByText(/connected/i).or(page.getByText(/ok/i))).toBeVisible({ timeout: 8000 });
  });

  test("can connect Depop via web mock button", async ({ page }) => {
    await page.goto("/connect/depop");
    await page.waitForLoadState("networkidle");

    const saveBtn = page.getByText(/save mock connection/i);
    await expect(saveBtn).toBeVisible({ timeout: 8000 });
    await saveBtn.click();

    await expect(page.getByText(/connected/i).or(page.getByText(/ok/i))).toBeVisible({ timeout: 8000 });
  });

  test("can disconnect Grailed", async ({ page, request }) => {
    await seedConnection(request, "grailed");
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByText(/settings/i).click();
    await page.waitForLoadState("networkidle");

    const disconnectBtn = page.getByText(/disconnect/i);
    await expect(disconnectBtn).toBeVisible({ timeout: 8000 });
    await disconnectBtn.click();

    // After disconnecting, the connect button should reappear for that platform
    await expect(page.getByText(/connect/i).first()).toBeVisible({ timeout: 6000 });
  });
});
