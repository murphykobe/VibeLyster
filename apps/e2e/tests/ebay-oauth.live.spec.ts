import { test, expect } from "@playwright/test";
import {
  captureEbaySandboxAuthorizationCode,
  connectEbayThroughApi,
  disconnectPlatformViaApi,
  getConnectionsViaApi,
} from "./live-helpers";

const API_URL = process.env.E2E_API_URL ?? (process.env.E2E_BASE_URL ? new URL(process.env.E2E_BASE_URL).origin : undefined);
const EBAY_TEST_ENABLED = ["1", "true", "yes", "on"].includes((process.env.E2E_EBAY_TEST ?? "").toLowerCase());

test.describe("eBay OAuth live", () => {
  test.skip(!EBAY_TEST_ENABLED, "Set E2E_EBAY_TEST=1 to run eBay OAuth live coverage.");

  test("callback route redirects to the app deep link with query params intact", async ({ request }) => {
    if (!API_URL) throw new Error("E2E_API_URL or E2E_BASE_URL is required.");

    const response = await request.get(
      `${API_URL}/api/ebay/callback?code=code-123&state=state-456&error_description=Denied%20by%20user`,
      { maxRedirects: 0 },
    );

    expect(response.status()).toBe(302);
    expect(response.headers()["location"]).toBe(
      "vibelyster://connect/ebay?code=code-123&state=state-456&error_description=Denied+by+user",
    );
  });

  test("captures a sandbox auth code and stores an eBay connection through the live API", async ({ page, request }) => {
    const { authorizationCode, ruName } = await captureEbaySandboxAuthorizationCode(page);

    try {
      const connection = await connectEbayThroughApi(page, request, { authorizationCode, ruName });

      expect(connection.platform).toBe("ebay");
      expect(connection.platform_username).toBeTruthy();

      const connections = await getConnectionsViaApi(page, request);
      expect(connections.some((item) => item.platform === "ebay")).toBe(true);
    } finally {
      await disconnectPlatformViaApi(page, request, "ebay").catch(() => undefined);
    }
  });
});
