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
