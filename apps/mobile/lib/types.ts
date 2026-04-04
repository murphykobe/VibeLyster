export type Platform = "grailed" | "depop" | "ebay";

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

export type Listing = {
  id: string;
  title: string;
  description: string;
  price: string;
  size: string | null;
  condition: string | null;
  brand: string | null;
  category: string | null;
  traits: Record<string, string>;
  photos: string[];
  voice_transcript: string | null;
  status: "active" | "deleted";
  created_at: string;
  updated_at: string;
  platform_listings: PlatformListing[] | null;
};

/** Derived display status for a listing, computed from platform_listings */
export function getDisplayStatus(listing: Listing): "draft" | "live" | "partially_live" | "sold" {
  const pls = listing.platform_listings ?? [];
  const live = pls.filter((p) => p.status === "live");
  const sold = pls.filter((p) => p.status === "sold");
  if (sold.length > 0) return "sold";
  if (live.length === pls.length && pls.length > 0) return "live";
  if (live.length > 0) return "partially_live";
  return "draft";
}

export type MarketplaceConnection = {
  id: string;
  platform: Platform;
  platform_username: string | null;
  connected_at: string;
  expires_at: string | null;
};
