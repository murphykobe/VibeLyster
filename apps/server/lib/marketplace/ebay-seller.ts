import type { EbaySellerReadiness } from "./types";

const EBAY_ACCOUNT_HOST = process.env.EBAY_SANDBOX === "true"
  ? "https://api.sandbox.ebay.com"
  : "https://api.ebay.com";

type PolicyRow = {
  name?: unknown;
  paymentPolicyId?: unknown;
  fulfillmentPolicyId?: unknown;
  returnPolicyId?: unknown;
};

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function pickFirstPolicy<T extends PolicyRow>(rows: T[] | undefined, idKey: keyof T) {
  const first = rows?.[0];
  if (!first) return undefined;
  const id = pickString(first[idKey]);
  const name = pickString(first.name);
  return id && name ? { id, name } : undefined;
}

export async function fetchEbaySellerReadiness({
  accessToken,
  fetchImpl = fetch,
}: {
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<EbaySellerReadiness> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };

  const [fulfillmentRes, paymentRes, returnRes] = await Promise.all([
    fetchImpl(`${EBAY_ACCOUNT_HOST}/sell/account/v1/fulfillment_policy`, { headers }),
    fetchImpl(`${EBAY_ACCOUNT_HOST}/sell/account/v1/payment_policy`, { headers }),
    fetchImpl(`${EBAY_ACCOUNT_HOST}/sell/account/v1/return_policy`, { headers }),
  ]);

  const [fulfillmentJson, paymentJson, returnJson] = await Promise.all([
    fulfillmentRes.json() as Promise<{ fulfillmentPolicies?: PolicyRow[] }> ,
    paymentRes.json() as Promise<{ paymentPolicies?: PolicyRow[] }> ,
    returnRes.json() as Promise<{ returnPolicies?: PolicyRow[] }> ,
  ]);

  const fulfillment = pickFirstPolicy(fulfillmentJson.fulfillmentPolicies, "fulfillmentPolicyId");
  const payment = pickFirstPolicy(paymentJson.paymentPolicies, "paymentPolicyId");
  const returnsPolicy = pickFirstPolicy(returnJson.returnPolicies, "returnPolicyId");

  const missing = [
    fulfillment ? null : "fulfillment_policy",
    payment ? null : "payment_policy",
    returnsPolicy ? null : "return_policy",
  ].filter(Boolean) as string[];

  return {
    ready: missing.length === 0,
    missing,
    policies: {
      payment,
      fulfillment,
      return: returnsPolicy,
    },
    checkedAt: new Date().toISOString(),
  };
}
