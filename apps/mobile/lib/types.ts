export type Platform = "grailed" | "depop" | "ebay";

export type EbayReadiness = {
  ready: boolean;
  missing: string[];
  checkedAt: string | null;
};

export type EbayListingMetadata = {
  ebayCategoryId?: string;
  ebayConditionId?: number;
  ebayAspects?: Record<string, string[]>;
  metadataSources?: Record<string, "deterministic" | "ai" | "user">;
  validationStatus?: "valid" | "incomplete";
  missingFields?: string[];
};

export type PlatformListing = {
  id: string;
  listing_id: string;
  platform: Platform;
  platform_listing_id: string | null;
  platform_data: Record<string, unknown>;
  status: "pending" | "publishing" | "live" | "failed" | "sold" | "delisted";
  last_error: string | null;
  attempt_count: number;
  published_at: string | null;
  last_synced_at: string | null;
};

export function getRemoteListingState(platformListing: PlatformListing): "draft" | "live" | null {
  const remoteState = platformListing.platform_data?.remote_state;
  return remoteState === "draft" || remoteState === "live" ? remoteState : null;
}

export type ListingAIVerification = {
  verificationStatus: "verified" | "requires_verification";
  unresolvedFields: string[];
  lowConfidenceFields: string[];
  fallbackTriggered: boolean;
  fallbackReason: string[];
  fallbackResolvedFields: string[];
  resolutionSource?: Record<string, "text" | "vision" | "user">;
};

export type ListingAIRawResponse = {
  transcript?: string;
  usedVision?: boolean;
  verification?: ListingAIVerification;
  listing?: Record<string, unknown>;
  pass1?: Record<string, unknown>;
  pass2?: Record<string, unknown> | null;
};

export type Listing = {
  id: string;
  title: string | null;
  description: string | null;
  price: string | null;
  size: { system: string; value: string } | string | null;
  condition: string | null;
  brand: string | null;
  category: string | null;
  traits: Record<string, string>;
  photos: string[];
  voice_transcript: string | null;
  ai_raw_response?: ListingAIRawResponse | null;
  generation_status: "generating" | "complete" | "failed";
  generation_error: string | null;
  status: "active" | "deleted";
  created_at: string;
  updated_at: string;
  platform_listings: PlatformListing[] | null;
};

export function getListingVerificationStatus(listing: Listing): "verified" | "requires_verification" {
  return listing.ai_raw_response?.verification?.verificationStatus === "requires_verification"
    ? "requires_verification"
    : "verified";
}

/** Derived display status for a listing, computed from platform_listings */
export function getDisplayStatus(listing: Listing): "draft" | "live" | "partially_live" | "sold" {
  const pls = listing.platform_listings;
  if (!pls || pls.length === 0) return "draft";

  let liveCount = 0;
  for (const p of pls) {
    if (p.status === "sold") return "sold";
    if (p.status === "live") liveCount++;
  }

  if (liveCount === pls.length) return "live";
  if (liveCount > 0) return "partially_live";
  return "draft";
}

export type MarketplaceConnection = {
  id: string;
  platform: Platform;
  platform_username: string | null;
  connected_at: string;
  expires_at: string | null;
  readiness?: EbayReadiness;
};
