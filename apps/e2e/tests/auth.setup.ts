import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const authFile = "./playwright/.auth/user.json";

test("sign in with Clerk test user", async ({ page }) => {
  if (!email || !password) {
    throw new Error("E2E_EMAIL and E2E_PASSWORD are required for live/preview E2E tests.");
  }

  await page.goto("/");
  await page.waitForURL(/\/sign-in(?:\?.*)?$/, { timeout: 30_000 }).catch(() => undefined);

  const emailInput = page.getByPlaceholder("Email");
  const passwordInput = page.getByPlaceholder("Password");

  if (await emailInput.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await emailInput.fill(email);
    await passwordInput.fill(password);
    await page.getByText(/^sign in$/i).click();
  }

  await page.waitForURL((url) => !url.pathname.endsWith("/sign-in"), { timeout: 30_000 });
  await expect(page.getByText(/closet command|no listings yet|drafts/i).first()).toBeVisible({ timeout: 30_000 });

  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
