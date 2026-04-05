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

async function parsePolicyResponse(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) as Record<string, unknown> : {};
  } catch {
    return { raw: text } satisfies Record<string, unknown>;
  }
}

function isInsufficientPermissions(payload: Record<string, unknown>) {
  const errors = Array.isArray(payload.errors) ? payload.errors : [];
  return errors.some((error) => {
    if (!error || typeof error !== "object") return false;
    const message = pickString((error as { message?: unknown }).message)?.toLowerCase();
    const longMessage = pickString((error as { longMessage?: unknown }).longMessage)?.toLowerCase();
    return message?.includes("access denied") || longMessage?.includes("insufficient permissions");
  });
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
    parsePolicyResponse(fulfillmentRes) as Promise<{ fulfillmentPolicies?: PolicyRow[]; errors?: unknown[] }>,
    parsePolicyResponse(paymentRes) as Promise<{ paymentPolicies?: PolicyRow[]; errors?: unknown[] }>,
    parsePolicyResponse(returnRes) as Promise<{ returnPolicies?: PolicyRow[]; errors?: unknown[] }>,
  ]);

  const policyResponses = [
    { response: fulfillmentRes, payload: fulfillmentJson },
    { response: paymentRes, payload: paymentJson },
    { response: returnRes, payload: returnJson },
  ];

  if (policyResponses.some(({ response }) => !response.ok)) {
    const insufficientPermissions = policyResponses.some(({ response, payload }) =>
      (response.status === 401 || response.status === 403) && isInsufficientPermissions(payload),
    );

    if (insufficientPermissions) {
      return {
        ready: false,
        missing: [],
        policies: {},
        checkedAt: new Date().toISOString(),
        requiresReconnect: true,
        actionableError: "Reconnect eBay to grant publish permissions, then try again.",
      };
    }

    const failedStatuses = policyResponses
      .filter(({ response }) => !response.ok)
      .map(({ response }) => response.status)
      .join(", ");

    return {
      ready: false,
      missing: [],
      policies: {},
      checkedAt: new Date().toISOString(),
      actionableError: `eBay seller readiness check failed (${failedStatuses}). Please try reconnecting eBay or try again later.`,
    };
  }

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
