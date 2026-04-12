import { describe, expect, it, vi } from "vitest";
import { syncLinkedGrailedDraftAfterSave } from "../grailed-save-sync";

describe("syncLinkedGrailedDraftAfterSave", () => {
  it("updates an existing linked Grailed draft after save", async () => {
    const publishDraft = vi.fn().mockResolvedValue({
      ok: true,
      platformListingId: "draft-123",
      remoteState: "draft",
      modeUsed: "draft",
      platformData: { remote_state: "draft", title: "Updated" },
    });
    const updateStatus = vi.fn().mockResolvedValue(undefined);

    await syncLinkedGrailedDraftAfterSave({
      listingId: "listing-1",
      platformListing: {
        platform_listing_id: "draft-123",
        platform_data: { remote_state: "draft", title: "Old" },
        status: "pending",
      },
      publishDraft,
      updateStatus,
    });

    expect(publishDraft).toHaveBeenCalledTimes(1);
    expect(updateStatus).toHaveBeenCalledWith("listing-1", "grailed", "pending", {
      platformListingId: "draft-123",
      platformData: { remote_state: "draft", title: "Updated" },
      lastError: undefined,
    });
  });

  it("does not sync when the linked Grailed remote state is live", async () => {
    const publishDraft = vi.fn();
    const updateStatus = vi.fn();

    await syncLinkedGrailedDraftAfterSave({
      listingId: "listing-1",
      platformListing: {
        platform_listing_id: "listing-123",
        platform_data: { remote_state: "live" },
        status: "live",
      },
      publishDraft,
      updateStatus,
    });

    expect(publishDraft).not.toHaveBeenCalled();
    expect(updateStatus).not.toHaveBeenCalled();
  });
});
