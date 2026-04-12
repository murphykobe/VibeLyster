import type { PublishResult } from "./types";

export async function syncLinkedGrailedDraftAfterSave(input: {
  listingId: string;
  platformListing: {
    platform_listing_id: string | null;
    platform_data: Record<string, unknown>;
    status: "pending" | "publishing" | "live" | "failed" | "sold" | "delisted";
  } | null | undefined;
  publishDraft: () => Promise<PublishResult>;
  updateStatus: (
    listingId: string,
    platform: "grailed",
    status: "pending" | "publishing" | "live" | "failed" | "sold" | "delisted",
    opts?: { platformListingId?: string; lastError?: string; platformData?: Record<string, unknown> }
  ) => Promise<unknown>;
}) {
  const remoteState = input.platformListing?.platform_data?.remote_state;
  const remoteDraftId = input.platformListing?.platform_listing_id;
  if (remoteState !== "draft" || !remoteDraftId) return false;

  const result = await input.publishDraft();
  if (result.ok) {
    await input.updateStatus(input.listingId, "grailed", "pending", {
      platformListingId: result.platformListingId,
      platformData: result.platformData,
      lastError: undefined,
    });
    return true;
  }

  await input.updateStatus(input.listingId, "grailed", "failed", {
    platformListingId: result.platformListingId ?? remoteDraftId,
    platformData: result.platformData,
    lastError: result.error,
  });
  return false;
}
