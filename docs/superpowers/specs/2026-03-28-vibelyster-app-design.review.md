# Design Review: VibeLyster App Design Spec (2026-03-28)

Scope reviewed: `docs/superpowers/specs/2026-03-28-vibelyster-app-design.md`

## Findings

1. High — Depop fallback path is underspecified and likely infeasible in Expo as written.
   The spec assumes a client-side fallback that uses `impit` if server-side token relay fails, but does not define how a Rust TLS-mimic binary will run inside an iOS Expo app or what the alternative is if it cannot. This is currently the primary mitigation for Depop blocking, so the mitigation itself needs a concrete plan or the risk remains unaddressed. (`docs/superpowers/specs/2026-03-28-vibelyster-app-design.md:30`, `docs/superpowers/specs/2026-03-28-vibelyster-app-design.md:33`, `docs/superpowers/specs/2026-03-28-vibelyster-app-design.md:46`, `docs/superpowers/specs/2026-03-28-vibelyster-app-design.md:178`, `docs/superpowers/specs/2026-03-28-vibelyster-app-design.md:323`)

2. High — Publish state is missing durable job status, errors, and idempotency.
   Multi-marketplace publishing will have partial success and retries, but the schema only models `draft/live/sold/delisted` and has no `publishing`, `failed`, `last_error`, or idempotency key to prevent duplicate listings after retry. This will make bulk publish unreliable and debugging opaque. (`docs/superpowers/specs/2026-03-28-vibelyster-app-design.md:105`, `docs/superpowers/specs/2026-03-28-vibelyster-app-design.md:119`, `docs/superpowers/specs/2026-03-28-vibelyster-app-design.md:266`)

3. Medium — Aggregate listing `status` conflicts with MVP scope.
   The global listing status is defined as `live` or `sold` based on “any platform,” but inventory sync is explicitly out of scope. This makes dashboard filters and delete/delist rules ambiguous when a listing is sold on one platform and live on another. (`docs/superpowers/specs/2026-03-28-vibelyster-app-design.md:59`, `docs/superpowers/specs/2026-03-28-vibelyster-app-design.md:116`, `docs/superpowers/specs/2026-03-28-vibelyster-app-design.md:262`, `docs/superpowers/specs/2026-03-28-vibelyster-app-design.md:299`)

4. Medium — Review UI does not expose fields needed to fix invalid drafts.
   The AI pipeline generates platform-specific category mappings and traits, but the edit screen only mentions title, price, size, condition, brand, and description. If category/traits are wrong or missing, publish will fail without a way to correct the draft. (`docs/superpowers/specs/2026-03-28-vibelyster-app-design.md:76`, `docs/superpowers/specs/2026-03-28-vibelyster-app-design.md:103`)

5. Medium — eBay requirements are under-specified for a “shared listing schema.”
   eBay listing creation requires policy selection (payment/shipping/returns), category/aspect requirements, and offer construction. The spec treats eBay as just another platform with shared fields, so the required policy and category data paths are missing. (`docs/superpowers/specs/2026-03-28-vibelyster-app-design.md:31`, `docs/superpowers/specs/2026-03-28-vibelyster-app-design.md:76`, `docs/superpowers/specs/2026-03-28-vibelyster-app-design.md:192`)

## Open Questions / Assumptions

- Assumed the intended doc is `docs/superpowers/specs/2026-03-28-vibelyster-app-design.md`.
- Assumed Expo means minimal custom native work; if a custom dev client is acceptable, the Depop fallback design needs to be spelled out rather than implied.

## Suggested Next Edits (Optional)

1. Add a `publish_jobs` or `platform_listing_attempts` table with `status`, `error`, `attempt_count`, `last_attempt_at`, and `idempotency_key`.
2. Replace aggregate listing `status` with a derived view from per-platform statuses or add a `has_live`, `has_sold` boolean field set.
3. Expand the edit UI to include category mapping and traits, or explicitly allow “publish anyway” with a validation warning.
4. Document the concrete Depop fallback strategy and the native/runtime requirements.
5. Add an eBay-specific section defining how business policies and category/aspect requirements are determined and stored.
