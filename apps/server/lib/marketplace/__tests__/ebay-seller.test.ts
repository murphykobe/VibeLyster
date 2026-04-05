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
    expect(result.policies.fulfillment?.id).toBe("fp-1");
    expect(result.policies.payment?.id).toBe("pp-1");
    expect(result.policies.return?.id).toBe("rp-1");
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
});
