import { describe, expect, it, vi } from "vitest";
import { fetchEbaySellerReadiness } from "../ebay-seller";

describe("fetchEbaySellerReadiness", () => {
  it("returns ready=true when all policy types exist", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ fulfillmentPolicies: [{ fulfillmentPolicyId: "fp-1", name: "Ship" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ paymentPolicies: [{ paymentPolicyId: "pp-1", name: "Pay" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ returnPolicies: [{ returnPolicyId: "rp-1", name: "Return" }] }), { status: 200 }));

    const result = await fetchEbaySellerReadiness({ accessToken: "token", fetchImpl: fetchMock as typeof fetch });

    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.marketplaceId).toBe("EBAY_US");
    expect(result.policies.fulfillment?.id).toBe("fp-1");
    expect(result.policies.payment?.id).toBe("pp-1");
    expect(result.policies.return?.id).toBe("rp-1");
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("marketplace_id=EBAY_US"),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("marketplace_id=EBAY_US"),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("marketplace_id=EBAY_US"),
      expect.any(Object),
    );
  });

  it("returns ready=false with missing policy names when one or more policy types are absent", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ fulfillmentPolicies: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ paymentPolicies: [{ paymentPolicyId: "pp-1", name: "Pay" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ returnPolicies: [] }), { status: 200 }));

    const result = await fetchEbaySellerReadiness({ accessToken: "token", fetchImpl: fetchMock as typeof fetch });

    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(["fulfillment_policy", "return_policy"]);
  });

  it("returns an actionable reconnect error when eBay denies seller account access", async () => {
    const accessDenied = JSON.stringify({
      errors: [{
        errorId: 1100,
        domain: "ACCESS",
        category: "REQUEST",
        message: "Access denied",
        longMessage: "Insufficient permissions to fulfill the request.",
      }],
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(accessDenied, { status: 403 }))
      .mockResolvedValueOnce(new Response(accessDenied, { status: 403 }))
      .mockResolvedValueOnce(new Response(accessDenied, { status: 403 }));

    const result = await fetchEbaySellerReadiness({ accessToken: "token", fetchImpl: fetchMock as typeof fetch });

    expect(result.ready).toBe(false);
    expect(result.requiresReconnect).toBe(true);
    expect(result.actionableError).toMatch(/reconnect ebay/i);
    expect(result.missing).toEqual([]);
  });

  it("returns sandbox business policy guidance when the seller account is not eligible", async () => {
    const notEligible = JSON.stringify({
      errors: [{
        errorId: 20403,
        domain: "API_ACCOUNT",
        category: "REQUEST",
        message: "Invalid .",
        longMessage: "User is not eligible for Business Policy.",
      }],
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(notEligible, { status: 400 }))
      .mockResolvedValueOnce(new Response(notEligible, { status: 400 }))
      .mockResolvedValueOnce(new Response(notEligible, { status: 400 }));

    const result = await fetchEbaySellerReadiness({ accessToken: "token", fetchImpl: fetchMock as typeof fetch });

    expect(result.ready).toBe(false);
    expect(result.requiresReconnect).not.toBe(true);
    expect(result.actionableError).toMatch(/business policy/i);
    expect(result.actionableError).toMatch(/sandbox/i);
  });
});
