import type {
  CanonicalListing,
  EbayListingMetadata,
  EbaySellerReadiness,
  EbayTokens,
  PublishOptions,
  PublishResult,
} from "./types";

const EBAY_INVENTORY_HOST = process.env.EBAY_SANDBOX === "true"
  ? "https://api.sandbox.ebay.com"
  : "https://api.ebay.com";

export async function publishToEbay(
  listing: CanonicalListing,
  tokens: EbayTokens,
  options: PublishOptions & {
    metadata: EbayListingMetadata;
    sellerReadiness: EbaySellerReadiness;
    fetchImpl?: typeof fetch;
  },
): Promise<PublishResult> {
  if (!options.sellerReadiness.ready) {
    return {
      ok: false,
      error: options.sellerReadiness.actionableError
        ?? `eBay seller setup incomplete: ${options.sellerReadiness.missing.join(", ")}`,
      retryable: false,
    };
  }

  if (options.metadata.validationStatus !== "valid") {
    return {
      ok: false,
      error: `eBay listing metadata incomplete: ${(options.metadata.missingFields ?? []).join(", ")}`,
      retryable: false,
    };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(`${EBAY_INVENTORY_HOST}/sell/inventory/v1/offer`, {
    method: options.existingPlatformListingId ? "PUT" : "POST",
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sku: listing.id,
      marketplaceId: options.sellerReadiness.marketplaceId ?? "EBAY_US",
      format: options.metadata.ebayListingFormat ?? "FIXED_PRICE",
      availableQuantity: 1,
      categoryId: options.metadata.ebayCategoryId,
      listingDescription: listing.description,
      merchantLocationKey: listing.id,
      pricingSummary: { price: { value: String(listing.price), currency: "USD" } },
      listingPolicies: {
        fulfillmentPolicyId: options.sellerReadiness.policies.fulfillment?.id,
        paymentPolicyId: options.sellerReadiness.policies.payment?.id,
        returnPolicyId: options.sellerReadiness.policies.return?.id,
      },
      aspects: options.metadata.ebayAspects,
      condition: options.metadata.ebayConditionId,
    }),
  });

  if (!response.ok) {
    return {
      ok: false,
      error: await response.text(),
      retryable: response.status >= 500 || response.status === 429,
    };
  }

  const json = await response.json() as { offerId?: string; listingId?: string };
  return {
    ok: true,
    platformListingId: json.listingId ?? json.offerId ?? listing.id,
    platformData: { ...options.metadata },
    remoteState: options.mode === "draft" ? "draft" : "live",
    modeUsed: options.mode ?? "live",
  };
}
