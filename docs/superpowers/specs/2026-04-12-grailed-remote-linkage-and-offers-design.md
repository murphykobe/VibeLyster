# Grailed Remote Linkage and Offers Design

## Goal
Make Grailed publishing reuse the same remote draft/listing instead of creating new ones, sync saved local edits to linked remote drafts asynchronously, and add a user-facing accept-offers toggle that defaults to false unless explicitly requested.

## Design

### Remote linkage persistence
When Grailed draft creation succeeds, persist the remote draft ID and `remote_state: "draft"` immediately, even if the later live submit step fails. This lets retries update the same remote draft instead of creating new orphan drafts.

### Retry behavior
For Grailed publishes, if a platform listing already has a Grailed remote draft ID with `remote_state: "draft"`, retry uses `PUT /api/listing_drafts/:id` before any submit attempt. If a live listing exists, future live-listing editing is a separate path and should not recreate the listing.

### Save-sync behavior
When a local listing save succeeds, asynchronously sync Grailed only when the linked remote state is `draft`. Live Grailed listings are not auto-updated on save; they require explicit publish/update actions. The local save stays fast while remote draft sync runs in the background.

### Accept offers
Store the accept-offers preference in canonical listing traits as `traits.accept_offers` with string values `"true"` or `"false"`. Grailed defaults to false when the trait is absent. AI generation should only set `traits.accept_offers = "true"` when the transcript explicitly indicates accepting offers; otherwise omit it. The listing edit screen exposes a dedicated toggle.

## Non-goals
- implementing automatic live-listing sync after every save
- redesigning non-Grailed marketplace sync architecture
