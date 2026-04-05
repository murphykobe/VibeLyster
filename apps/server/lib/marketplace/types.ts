/**
 * Shared types for the marketplace posting module.
 * The canonical listing object lives in the DB; platform transforms happen here at publish time.
 */

export type Platform = "grailed" | "depop" | "ebay";
export type PublishMode = "live" | "draft";
export type RemoteListingState = "live" | "draft";

/** Canonical listing from the DB — all fields the AI generates */
export type CanonicalListing = {
  id: string;
  title: string;
  description: string;
  price: number;
  size: string | null;
  condition: string | null;
  brand: string | null;
  category: string | null;
  traits: Record<string, string>;
  photos: string[]; // Vercel Blob URLs
};

/** Grailed auth tokens from marketplace_connections.encrypted_tokens */
export type GrailedTokens = {
  csrf_token: string;
  cookies: string;
};

/** Depop auth tokens from marketplace_connections.encrypted_tokens */
export type DepopTokens = {
  access_token: string;
};

export type EbaySellerReadiness = {
  ready: boolean;
  missing: string[];
  policies: {
    payment?: { id: string; name: string };
    fulfillment?: { id: string; name: string };
    return?: { id: string; name: string };
  };
  marketplaceId?: string;
  checkedAt: string;
  actionableError?: string;
  requiresReconnect?: boolean;
};

export type EbayListingMetadata = {
  ebayCategoryId?: string;
  ebayConditionId?: number;
  ebayAspects?: Record<string, string[]>;
  ebayListingFormat?: "FIXED_PRICE";
  metadataSources?: Record<string, "deterministic" | "ai" | "user">;
  validationStatus?: "valid" | "incomplete";
  missingFields?: string[];
};

export type EbayTokens = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  ebay_user_id: string;
  expires_at: string;
  refresh_token_expires_in?: number;
  seller_readiness?: EbaySellerReadiness;
};

export type PublishOptions = {
  mode?: PublishMode;
  existingPlatformListingId?: string | null;
  existingPlatformData?: Record<string, unknown> | null;
};

/** Result returned by a marketplace connection verification probe */
export type ConnectionProbeResult =
  | { ok: true; platformUsername?: string; expiresAt?: string }
  | { ok: false; error: string };

/** Result returned by a publish call */
export type PublishResult =
  | {
    ok: true;
    platformListingId: string;
    platformData: Record<string, unknown>;
    remoteState: RemoteListingState;
    modeUsed: PublishMode;
  }
  | { ok: false; error: string; retryable: boolean };

/** Result returned by a delist call */
export type DelistResult =
  | { ok: true }
  | { ok: false; error: string; retryable: boolean };

/** Result returned by a status check */
export type StatusResult =
  | { ok: true; status: "live" | "sold" | "delisted" | "unknown" }
  | { ok: false; error: string };
