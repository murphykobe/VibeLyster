# eBay Single-Listing Publish + Maestro CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship end-to-end single-listing eBay sandbox publish/draft from the app, including seller-readiness checks, listing-level eBay metadata generation/editing, and deterministic Maestro iOS coverage in GitHub PR CI.

**Architecture:** Keep the existing schema and route shape. Store seller-readiness snapshots inside the decrypted eBay token payload in `marketplace_connections.encrypted_tokens`, and store listing-level eBay metadata in `platform_listings.platform_data`. Add focused server-side eBay modules for seller readiness, metadata generation/validation, and publish calls; then wire mobile UI and CI on top.

**Tech Stack:** Next.js route handlers, Vitest, Playwright, Expo Router / React Native, Maestro, GitHub Actions, eBay sandbox APIs, AI SDK-backed metadata generation via existing `apps/server/lib/ai.ts` patterns.

---

## File structure / responsibilities

### Server marketplace files
- Modify: `apps/server/lib/marketplace/ebay.ts`
  - Expand OAuth scopes from identity-only to publish-capable scopes and keep OAuth/token exchange logic here.
- Create: `apps/server/lib/marketplace/ebay-seller.ts`
  - Fetch seller business policies / readiness state from eBay APIs.
- Create: `apps/server/lib/marketplace/ebay-metadata.ts`
  - Deterministic category/condition/aspect mapping + AI fallback orchestration + validation.
- Create: `apps/server/lib/marketplace/ebay-publish.ts`
  - Build and send draft/live publish requests to eBay sandbox.
- Modify: `apps/server/lib/marketplace/types.ts`
  - Add `EbayTokens`, `EbaySellerReadiness`, `EbayListingMetadata`, and publish helper types.

### Server route / persistence files
- Modify: `apps/server/app/api/connect/route.ts`
  - Persist expanded-scope eBay tokens and initialize readiness snapshot shape.
- Modify: `apps/server/app/api/connections/route.ts`
  - Expose eBay readiness summary to the client.
- Modify: `apps/server/app/api/publish/route.ts`
  - Route eBay publish requests through the new seller/metadata/publish modules.
- Create: `apps/server/app/api/listings/[id]/ebay-metadata/route.ts`
  - Save user-edited listing-level eBay metadata back into `platform_listings.platform_data`.
- Modify: `apps/server/lib/db.ts`
  - Support reading decrypted eBay readiness summary for `GET /api/connections` and merging eBay platform metadata.
- Modify: `apps/server/lib/validation.ts`
  - Add request validation for eBay metadata updates.

### Mobile files
- Modify: `apps/mobile/lib/types.ts`
  - Add typed eBay readiness + metadata shapes.
- Modify: `apps/mobile/lib/api.ts`
  - Add `saveEbayListingMetadata()` and typed `getConnections()` readiness support.
- Create: `apps/mobile/components/EbayMetadataEditor.tsx`
  - Focused listing-level editor for generated eBay metadata.
- Modify: `apps/mobile/app/listing/[id].tsx`
  - Show eBay as publishable, surface validation failures, render metadata editor.
- Modify: `apps/mobile/app/(tabs)/settings.tsx`
  - Show read-only eBay readiness hint under the eBay connection row.

### Test / verification files
- Modify: `apps/server/lib/marketplace/__tests__/ebay.test.ts`
- Create: `apps/server/lib/marketplace/__tests__/ebay-seller.test.ts`
- Create: `apps/server/lib/marketplace/__tests__/ebay-metadata.test.ts`
- Create: `apps/server/lib/marketplace/__tests__/ebay-publish.test.ts`
- Modify: `apps/server/app/api/__tests__/routes.test.ts`
- Modify: `apps/e2e/tests/helpers.ts`
- Modify: `apps/e2e/tests/live-helpers.ts`
- Create: `apps/e2e/tests/ebay-publish.spec.ts`
- Create: `apps/e2e/tests/ebay-publish.live.spec.ts`
- Modify: `apps/mobile/.maestro/README.md`
- Create: `.github/workflows/maestro-ios.yml`

---

### Task 1: Expand eBay auth scopes and shared types

**Files:**
- Modify: `apps/server/lib/marketplace/ebay.ts`
- Modify: `apps/server/lib/marketplace/types.ts`
- Modify: `apps/server/lib/marketplace/__tests__/ebay.test.ts`
- Modify: `apps/mobile/app/connect/[platform].tsx`
- Modify: `apps/mobile/app/connect/[platform].web.tsx`

- [ ] **Step 1: Write the failing scope/type tests**

```ts
// apps/server/lib/marketplace/__tests__/ebay.test.ts
it("includes publish-capable scopes in the authorize URL", () => {
  const url = buildEbayAuthorizeUrl({
    clientId: "client-id",
    ruName: "ru-name",
    state: "state-123",
  });

  const parsed = new URL(url);
  const scope = parsed.searchParams.get("scope") ?? "";

  expect(scope).toContain("commerce.identity.readonly");
  expect(scope).toContain("sell.account.readonly");
  expect(scope).toContain("sell.inventory");
  expect(scope).toContain("sell.inventory.readonly");
  expect(scope).toContain("sell.fulfillment.readonly");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd apps/server && npx vitest run lib/marketplace/__tests__/ebay.test.ts -t "includes publish-capable scopes"
```

Expected: FAIL because the current authorize URL only includes `commerce.identity.readonly`.

- [ ] **Step 3: Add the shared scope/type definitions**

```ts
// apps/server/lib/marketplace/types.ts
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
```

```ts
// apps/server/lib/marketplace/ebay.ts
export const EBAY_AUTH_SCOPES = [
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.account.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.inventory.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly",
];

export function buildEbayAuthorizeUrl({ clientId, ruName, state }: EbayAuthorizeUrlInput): string {
  const url = new URL(`${EBAY_AUTH_HOST}/oauth2/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", ruName);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", EBAY_AUTH_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}
```

```ts
// apps/mobile/app/connect/[platform].tsx and .web.tsx
const EBAY_SCOPE = EBAY_AUTH_SCOPES.join(" ");
```

- [ ] **Step 4: Run the targeted tests and typecheck**

Run:
```bash
cd apps/server && npx vitest run lib/marketplace/__tests__/ebay.test.ts
cd ../mobile && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/lib/marketplace/ebay.ts apps/server/lib/marketplace/types.ts apps/server/lib/marketplace/__tests__/ebay.test.ts apps/mobile/app/connect/[platform].tsx apps/mobile/app/connect/[platform].web.tsx
git commit -m "feat: expand ebay oauth scopes for publish"
```

### Task 2: Add eBay seller-readiness fetching

**Files:**
- Create: `apps/server/lib/marketplace/ebay-seller.ts`
- Create: `apps/server/lib/marketplace/__tests__/ebay-seller.test.ts`
- Modify: `apps/server/lib/marketplace/types.ts`

- [ ] **Step 1: Write the failing seller-readiness tests**

```ts
// apps/server/lib/marketplace/__tests__/ebay-seller.test.ts
import { describe, expect, it, vi } from "vitest";
import { fetchEbaySellerReadiness } from "../ebay-seller";

describe("fetchEbaySellerReadiness", () => {
  it("returns ready=true when all policy types exist", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ fulfillmentPolicies: [{ fulfillmentPolicyId: "fp-1", name: "Ship" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ paymentPolicies: [{ paymentPolicyId: "pp-1", name: "Pay" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ returnPolicies: [{ returnPolicyId: "rp-1", name: "Return" }] }), { status: 200 }));

    const result = await fetchEbaySellerReadiness({ accessToken: "token", fetchImpl: fetchMock as typeof fetch });

    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.policies.fulfillment?.id).toBe("fp-1");
    expect(result.policies.payment?.id).toBe("pp-1");
    expect(result.policies.return?.id).toBe("rp-1");
  });

  it("returns ready=false with missing policy names when one or more policy types are absent", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ fulfillmentPolicies: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ paymentPolicies: [{ paymentPolicyId: "pp-1", name: "Pay" }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ returnPolicies: [] }), { status: 200 }));

    const result = await fetchEbaySellerReadiness({ accessToken: "token", fetchImpl: fetchMock as typeof fetch });

    expect(result.ready).toBe(false);
    expect(result.missing).toEqual(["fulfillment_policy", "return_policy"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd apps/server && npx vitest run lib/marketplace/__tests__/ebay-seller.test.ts
```

Expected: FAIL because the module does not exist yet.

- [ ] **Step 3: Implement the readiness fetcher**

```ts
// apps/server/lib/marketplace/ebay-seller.ts
import type { EbaySellerReadiness } from "./types";

const EBAY_ACCOUNT_HOST = process.env.EBAY_SANDBOX === "true"
  ? "https://api.sandbox.ebay.com"
  : "https://api.ebay.com";

function pickFirstPolicy<T extends { [key: string]: unknown }>(rows: T[], idKey: string) {
  const first = rows[0];
  if (!first) return undefined;
  const id = typeof first[idKey] === "string" ? (first[idKey] as string) : undefined;
  const name = typeof first.name === "string" ? first.name : undefined;
  return id && name ? { id, name } : undefined;
}

export async function fetchEbaySellerReadiness({
  accessToken,
  fetchImpl = fetch,
}: {
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<EbaySellerReadiness> {
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };

  const [fulfillmentRes, paymentRes, returnRes] = await Promise.all([
    fetchImpl(`${EBAY_ACCOUNT_HOST}/sell/account/v1/fulfillment_policy`, { headers }),
    fetchImpl(`${EBAY_ACCOUNT_HOST}/sell/account/v1/payment_policy`, { headers }),
    fetchImpl(`${EBAY_ACCOUNT_HOST}/sell/account/v1/return_policy`, { headers }),
  ]);

  const [fulfillmentJson, paymentJson, returnJson] = await Promise.all([
    fulfillmentRes.json(),
    paymentRes.json(),
    returnRes.json(),
  ]);

  const fulfillment = pickFirstPolicy(fulfillmentJson.fulfillmentPolicies ?? [], "fulfillmentPolicyId");
  const payment = pickFirstPolicy(paymentJson.paymentPolicies ?? [], "paymentPolicyId");
  const returnsPolicy = pickFirstPolicy(returnJson.returnPolicies ?? [], "returnPolicyId");

  const missing = [
    fulfillment ? null : "fulfillment_policy",
    payment ? null : "payment_policy",
    returnsPolicy ? null : "return_policy",
  ].filter(Boolean) as string[];

  return {
    ready: missing.length === 0,
    missing,
    policies: { fulfillment, payment, return: returnsPolicy },
    checkedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Run the tests**

Run:
```bash
cd apps/server && npx vitest run lib/marketplace/__tests__/ebay-seller.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/lib/marketplace/ebay-seller.ts apps/server/lib/marketplace/__tests__/ebay-seller.test.ts apps/server/lib/marketplace/types.ts
git commit -m "feat: fetch ebay seller readiness from account policies"
```

### Task 3: Add eBay listing metadata mapping, AI fallback, and validation

**Files:**
- Create: `apps/server/lib/marketplace/ebay-metadata.ts`
- Create: `apps/server/lib/marketplace/__tests__/ebay-metadata.test.ts`
- Modify: `apps/server/lib/ai.ts`
- Modify: `apps/server/lib/marketplace/types.ts`

- [ ] **Step 1: Write the failing metadata tests**

```ts
// apps/server/lib/marketplace/__tests__/ebay-metadata.test.ts
import { describe, expect, it, vi } from "vitest";
import { buildEbayListingMetadata } from "../ebay-metadata";

const LISTING = {
  id: "listing-1",
  title: "Nike Hoodie",
  description: "Black Nike hoodie, size M",
  price: 80,
  size: "M",
  condition: "gently_used",
  brand: "Nike",
  category: "tops.hoodie",
  traits: { color: "Black", material: "Cotton" },
  photos: ["https://example.com/hoodie.jpg"],
};

describe("buildEbayListingMetadata", () => {
  it("maps supported apparel fields deterministically without calling AI", async () => {
    const generateFallback = vi.fn();
    const result = await buildEbayListingMetadata({ listing: LISTING, generateFallback });

    expect(result.metadata.ebayCategoryId).toBeTruthy();
    expect(result.metadata.ebayConditionId).toBeTruthy();
    expect(result.metadata.ebayAspects?.Brand).toEqual(["Nike"]);
    expect(result.metadata.validationStatus).toBe("valid");
    expect(generateFallback).not.toHaveBeenCalled();
  });

  it("calls AI only for missing aspects and marks those fields as ai-generated", async () => {
    const generateFallback = vi.fn().mockResolvedValue({
      Material: ["Leather"],
      Department: ["Men"],
    });

    const result = await buildEbayListingMetadata({
      listing: { ...LISTING, category: "footwear.sneakers", traits: {} },
      generateFallback,
    });

    expect(generateFallback).toHaveBeenCalledTimes(1);
    expect(result.metadata.ebayAspects?.Material).toEqual(["Leather"]);
    expect(result.metadata.metadataSources?.Material).toBe("ai");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd apps/server && npx vitest run lib/marketplace/__tests__/ebay-metadata.test.ts
```

Expected: FAIL because the module does not exist yet.

- [ ] **Step 3: Implement deterministic mapping + AI fallback orchestration**

```ts
// apps/server/lib/marketplace/ebay-metadata.ts
import type { CanonicalListing, EbayListingMetadata } from "./types";

type AspectMap = Record<string, string[]>;

type BuildResult = {
  metadata: EbayListingMetadata;
};

const CATEGORY_MAP: Record<string, { ebayCategoryId: string; requiredAspects: string[] }> = {
  "tops.hoodie": { ebayCategoryId: "155183", requiredAspects: ["Brand", "Size Type", "Size", "Department"] },
  "footwear.sneakers": { ebayCategoryId: "15709", requiredAspects: ["Brand", "US Shoe Size", "Department"] },
};

const CONDITION_MAP: Record<string, number> = {
  new: 1000,
  gently_used: 3000,
  used: 3000,
  heavily_used: 7000,
};

export async function buildEbayListingMetadata({
  listing,
  existing,
  generateFallback,
}: {
  listing: CanonicalListing;
  existing?: EbayListingMetadata;
  generateFallback: (input: { listing: CanonicalListing; missingAspects: string[] }) => Promise<AspectMap>;
}): Promise<BuildResult> {
  const category = CATEGORY_MAP[listing.category ?? ""];
  const deterministicAspects: AspectMap = {
    ...(listing.brand ? { Brand: [listing.brand] } : {}),
    ...(listing.size ? { Size: [listing.size], "US Shoe Size": [listing.size], "Size Type": ["Regular"] } : {}),
    ...(listing.traits.color ? { Color: [String(listing.traits.color)] } : {}),
    ...(listing.traits.material ? { Material: [String(listing.traits.material)] } : {}),
  };

  const base: EbayListingMetadata = {
    ...existing,
    ebayCategoryId: existing?.ebayCategoryId ?? category?.ebayCategoryId,
    ebayConditionId: existing?.ebayConditionId ?? CONDITION_MAP[listing.condition ?? ""],
    ebayListingFormat: "FIXED_PRICE",
    ebayAspects: { ...(existing?.ebayAspects ?? {}), ...deterministicAspects },
    metadataSources: { ...(existing?.metadataSources ?? {}) },
  };

  for (const key of Object.keys(deterministicAspects)) {
    base.metadataSources![key] = base.metadataSources?.[key] ?? "deterministic";
  }

  const missingAspects = (category?.requiredAspects ?? []).filter((key) => !base.ebayAspects?.[key]?.length);
  if (missingAspects.length > 0) {
    const generated = await generateFallback({ listing, missingAspects });
    for (const [key, value] of Object.entries(generated)) {
      if (!base.ebayAspects?.[key]?.length) {
        base.ebayAspects![key] = value;
        base.metadataSources![key] = "ai";
      }
    }
  }

  const finalMissing = (category?.requiredAspects ?? []).filter((key) => !base.ebayAspects?.[key]?.length);
  base.validationStatus = base.ebayCategoryId && base.ebayConditionId && finalMissing.length === 0 ? "valid" : "incomplete";
  base.missingFields = finalMissing;

  return { metadata: base };
}
```

```ts
// apps/server/lib/ai.ts
export async function generateEbayAspects(input: {
  listing: { title: string; description: string; brand: string | null; size: string | null; category: string | null; traits: Record<string, string> };
  missingAspects: string[];
}): Promise<Record<string, string[]>> {
  // Mirror the existing AI SDK usage pattern from generateListing();
  // keep prompt narrow and return structured JSON only.
}
```

- [ ] **Step 4: Run the metadata tests**

Run:
```bash
cd apps/server && npx vitest run lib/marketplace/__tests__/ebay-metadata.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/lib/marketplace/ebay-metadata.ts apps/server/lib/marketplace/__tests__/ebay-metadata.test.ts apps/server/lib/ai.ts apps/server/lib/marketplace/types.ts
git commit -m "feat: generate ebay listing metadata with deterministic mapping and ai fallback"
```

### Task 4: Add eBay publish client and wire `POST /api/publish`

**Files:**
- Create: `apps/server/lib/marketplace/ebay-publish.ts`
- Create: `apps/server/lib/marketplace/__tests__/ebay-publish.test.ts`
- Modify: `apps/server/app/api/publish/route.ts`
- Modify: `apps/server/app/api/__tests__/routes.test.ts`
- Modify: `apps/server/lib/marketplace/types.ts`
- Modify: `apps/server/app/api/connect/route.ts`

- [ ] **Step 1: Write the failing publish tests**

```ts
// apps/server/lib/marketplace/__tests__/ebay-publish.test.ts
import { describe, expect, it, vi } from "vitest";
import { publishToEbay } from "../ebay-publish";

const TOKENS = {
  access_token: "token",
  refresh_token: "refresh",
  token_type: "Bearer",
  ebay_user_id: "user-1",
  expires_at: new Date(Date.now() + 3600_000).toISOString(),
};

const LISTING = {
  id: "listing-1",
  title: "Nike Hoodie",
  description: "Black Nike hoodie, size M",
  price: 80,
  size: "M",
  condition: "gently_used",
  brand: "Nike",
  category: "tops.hoodie",
  traits: { color: "Black" },
  photos: ["https://example.com/hoodie.jpg"],
};

it("creates an eBay draft when mode=draft", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ offerId: "offer-1", listingId: "listing-remote-1" }), { status: 200 }));
  const result = await publishToEbay(LISTING, TOKENS, {
    mode: "draft",
    metadata: {
      ebayCategoryId: "155183",
      ebayConditionId: 3000,
      ebayListingFormat: "FIXED_PRICE",
      ebayAspects: { Brand: ["Nike"], Department: ["Men"], Size: ["M"], "Size Type": ["Regular"] },
      validationStatus: "valid",
    },
    sellerReadiness: {
      ready: true,
      missing: [],
      policies: {
        payment: { id: "pp-1", name: "Pay" },
        fulfillment: { id: "fp-1", name: "Ship" },
        return: { id: "rp-1", name: "Return" },
      },
      checkedAt: new Date().toISOString(),
    },
    fetchImpl: fetchMock as typeof fetch,
  });

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.remoteState).toBe("draft");
    expect(result.modeUsed).toBe("draft");
  }
});
```

```ts
// apps/server/app/api/__tests__/routes.test.ts
it("publishes to ebay when connected and seller readiness is complete", async () => {
  const createRes = await createListing(req("POST", "/api/listings", { body: VALID_LISTING }));
  const { id } = await createRes.json();

  await connectPlatform(req("POST", "/api/connect", {
    body: { platform: "ebay", authorizationCode: "ebay-code-1", ruName: "ru-name" },
  }));

  const res = await publishListing(req("POST", "/api/publish", {
    body: { listingId: id, platforms: ["ebay"], mode: "draft" },
  }));

  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.results.ebay.ok).toBe(true);
  expect(data.results.ebay.remoteState).toBe("draft");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd apps/server && npx vitest run lib/marketplace/__tests__/ebay-publish.test.ts
cd apps/server && npx vitest run app/api/__tests__/routes.test.ts -t "publishes to ebay when connected"
```

Expected: FAIL because no eBay publish client exists and `/api/publish` returns `eBay not yet supported`.

- [ ] **Step 3: Implement the eBay publish client and route wiring**

```ts
// apps/server/lib/marketplace/ebay-publish.ts
import type { CanonicalListing, EbayListingMetadata, EbaySellerReadiness, EbayTokens, PublishOptions, PublishResult } from "./types";

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
    return { ok: false, error: `eBay seller setup incomplete: ${options.sellerReadiness.missing.join(", ")}`, retryable: false };
  }
  if (options.metadata.validationStatus !== "valid") {
    return { ok: false, error: `eBay listing metadata incomplete: ${(options.metadata.missingFields ?? []).join(", ")}`, retryable: false };
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
      listingPolicies: {
        fulfillmentPolicyId: options.sellerReadiness.policies.fulfillment?.id,
        paymentPolicyId: options.sellerReadiness.policies.payment?.id,
        returnPolicyId: options.sellerReadiness.policies.return?.id,
      },
      pricingSummary: { price: { value: String(listing.price), currency: "USD" } },
      listingDescription: listing.description,
      merchantLocationKey: listing.id,
    }),
  });

  if (!response.ok) {
    return { ok: false, error: await response.text(), retryable: response.status >= 500 || response.status === 429 };
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
```

```ts
// apps/server/app/api/publish/route.ts
if (platform === "ebay") {
  const ebayTokens = tokens as EbayTokens;
  const sellerReadiness = await fetchEbaySellerReadiness({ accessToken: ebayTokens.access_token });
  const { metadata } = await buildEbayListingMetadata({
    listing: canonical,
    existing: existingPlatformListing?.platform_data as EbayListingMetadata | undefined,
    generateFallback: ({ listing, missingAspects }) => generateEbayAspects({
      listing: {
        title: listing.title,
        description: listing.description,
        brand: listing.brand,
        size: listing.size,
        category: listing.category,
        traits: listing.traits,
      },
      missingAspects,
    }),
  });

  const result = await publishToEbay(canonical, ebayTokens, {
    mode,
    existingPlatformListingId: existingPlatformListing?.platform_listing_id,
    metadata,
    sellerReadiness,
  });
  // persist metadata/result here
}
```

```ts
// apps/server/app/api/connect/route.ts
encryptedTokens = encryptTokens({
  access_token: exchange.accessToken,
  refresh_token: exchange.refreshToken,
  token_type: exchange.tokenType,
  ebay_user_id: ebayVerification.ebayUserId,
  expires_at: expiresAtIso,
  seller_readiness: {
    ready: false,
    missing: [],
    policies: {},
    checkedAt: new Date(0).toISOString(),
  },
  ...(exchange.refreshTokenExpiresIn === undefined ? {} : { refresh_token_expires_in: exchange.refreshTokenExpiresIn }),
});
```

- [ ] **Step 4: Run the publish tests**

Run:
```bash
cd apps/server && npx vitest run lib/marketplace/__tests__/ebay-publish.test.ts
cd apps/server && npx vitest run app/api/__tests__/routes.test.ts -t "POST /api/publish"
```

Expected: PASS with new eBay draft/live cases added.

- [ ] **Step 5: Commit**

```bash
git add apps/server/lib/marketplace/ebay-publish.ts apps/server/lib/marketplace/__tests__/ebay-publish.test.ts apps/server/app/api/publish/route.ts apps/server/app/api/__tests__/routes.test.ts apps/server/app/api/connect/route.ts apps/server/lib/marketplace/types.ts
git commit -m "feat: publish single listings to ebay sandbox"
```

### Task 5: Expose seller readiness + add editable listing-level eBay metadata endpoint

**Files:**
- Create: `apps/server/app/api/listings/[id]/ebay-metadata/route.ts`
- Modify: `apps/server/lib/validation.ts`
- Modify: `apps/server/app/api/connections/route.ts`
- Modify: `apps/server/lib/db.ts`
- Modify: `apps/server/app/api/__tests__/routes.test.ts`

- [ ] **Step 1: Write failing route tests**

```ts
// apps/server/app/api/__tests__/routes.test.ts
it("returns ebay readiness summary from GET /api/connections", async () => {
  await connectPlatform(req("POST", "/api/connect", {
    body: { platform: "ebay", authorizationCode: "ebay-code-1", ruName: "ru-name" },
  }));

  const res = await listConnections(req("GET", "/api/connections"));
  const data = await res.json();
  const ebay = data.find((row: { platform: string }) => row.platform === "ebay");

  expect(ebay.readiness).toEqual(expect.objectContaining({
    ready: expect.any(Boolean),
    missing: expect.any(Array),
  }));
});

it("saves user-edited ebay metadata to platform_listings.platform_data", async () => {
  const createRes = await createListing(req("POST", "/api/listings", { body: VALID_LISTING }));
  const { id } = await createRes.json();

  const saveRes = await saveEbayMetadata(req("PATCH", `/api/listings/${id}/ebay-metadata`, {
    body: {
      ebayCategoryId: "155183",
      ebayAspects: { Department: ["Men"] },
      metadataSources: { Department: "user" },
    },
  }), params(id));

  expect(saveRes.status).toBe(200);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
cd apps/server && npx vitest run app/api/__tests__/routes.test.ts -t "returns ebay readiness summary"
cd apps/server && npx vitest run app/api/__tests__/routes.test.ts -t "saves user-edited ebay metadata"
```

Expected: FAIL because readiness is not returned and the metadata route does not exist.

- [ ] **Step 3: Implement readiness exposure and metadata save route**

```ts
// apps/server/lib/validation.ts
export const UpdateEbayMetadataBody = z.object({
  ebayCategoryId: z.string().min(1).optional(),
  ebayConditionId: z.number().int().optional(),
  ebayAspects: z.record(z.array(z.string())).optional(),
  metadataSources: z.record(z.enum(["deterministic", "ai", "user"])).optional(),
});
```

```ts
// apps/server/app/api/connections/route.ts
import { decryptTokens } from "@/lib/crypto";

const connections = await getConnections(user.id, { includeEncryptedTokens: true });
return Response.json(connections.map((connection) => {
  if (connection.platform !== "ebay") return connection;
  const decrypted = decryptTokens(connection.encrypted_tokens);
  return {
    id: connection.id,
    platform: connection.platform,
    platform_username: connection.platform_username,
    connected_at: connection.connected_at,
    expires_at: connection.expires_at,
    readiness: decrypted.seller_readiness ?? { ready: false, missing: [], policies: {}, checkedAt: null },
  };
}));
```

```ts
// apps/server/app/api/listings/[id]/ebay-metadata/route.ts
import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getListingById, upsertPlatformListing } from "@/lib/db";
import { UpdateEbayMetadataBody, parseBody } from "@/lib/validation";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth(req);
  const { id } = await params;
  const parsed = parseBody(UpdateEbayMetadataBody, await req.json());
  if ("error" in parsed) return parsed.error;

  const listing = await getListingById(user.id, id);
  if (!listing) return Response.json({ error: "Not found" }, { status: 404 });

  const existing = listing.platform_listings?.find((row) => row.platform === "ebay");
  const platformData = {
    ...(existing?.platform_data ?? {}),
    ...parsed.data,
    validationStatus: "incomplete",
  };

  const row = await upsertPlatformListing(id, "ebay", {
    status: existing?.status ?? "pending",
    platform_listing_id: existing?.platform_listing_id ?? null,
    platform_data: platformData,
    last_error: existing?.last_error ?? null,
    attempt_count: existing?.attempt_count ?? 0,
  });

  return Response.json(row);
}
```

- [ ] **Step 4: Run the route tests**

Run:
```bash
cd apps/server && npx vitest run app/api/__tests__/routes.test.ts -t "GET /api/connections"
cd apps/server && npx vitest run app/api/__tests__/routes.test.ts -t "ebay metadata"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/app/api/listings/[id]/ebay-metadata/route.ts apps/server/lib/validation.ts apps/server/app/api/connections/route.ts apps/server/lib/db.ts apps/server/app/api/__tests__/routes.test.ts
git commit -m "feat: expose ebay readiness and editable listing metadata"
```

### Task 6: Add mobile eBay metadata UI and mock E2E coverage

**Files:**
- Modify: `apps/mobile/lib/types.ts`
- Modify: `apps/mobile/lib/api.ts`
- Create: `apps/mobile/components/EbayMetadataEditor.tsx`
- Modify: `apps/mobile/app/listing/[id].tsx`
- Modify: `apps/mobile/app/(tabs)/settings.tsx`
- Modify: `apps/e2e/tests/helpers.ts`
- Create: `apps/e2e/tests/ebay-publish.spec.ts`

- [ ] **Step 1: Write the failing mock E2E spec**

```ts
// apps/e2e/tests/ebay-publish.spec.ts
import { test, expect } from "@playwright/test";
import { seedListing, seedEbayConnection } from "./helpers";

test("ebay publish failure reveals editable ebay metadata section", async ({ page, request }) => {
  const listing = await seedListing(request, {
    title: "Mystery jacket",
    category: "outerwear.jacket",
    brand: "Unknown",
    traits: {},
  });
  await seedEbayConnection(request, { ready: true });

  await page.goto(`/listing/${listing.id}`);
  await page.waitForLoadState("networkidle");

  await page.getByText("Publish", { exact: true }).last().click();

  await expect(page.getByText(/eBay details/i)).toBeVisible({ timeout: 8000 });
  await expect(page.getByLabel(/Department/i)).toBeVisible({ timeout: 8000 });
});

test("settings shows ebay readiness hint", async ({ page, request }) => {
  await seedEbayConnection(request, { ready: false, missing: ["fulfillment_policy"] });

  await page.goto("/settings");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText(/seller setup incomplete/i)).toBeVisible({ timeout: 8000 });
  await expect(page.getByText(/fulfillment_policy/i)).toBeVisible({ timeout: 8000 });
});
```

- [ ] **Step 2: Run the spec to verify it fails**

Run:
```bash
cd apps/e2e && npx playwright test tests/ebay-publish.spec.ts
```

Expected: FAIL because mock helpers do not seed eBay readiness and the UI does not render eBay metadata/readiness hints.

- [ ] **Step 3: Add mobile types/API and focused editor component**

```ts
// apps/mobile/lib/types.ts
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

export type MarketplaceConnection = {
  id: string;
  platform: Platform;
  platform_username: string | null;
  connected_at: string;
  expires_at: string | null;
  readiness?: EbayReadiness;
};
```

```ts
// apps/mobile/lib/api.ts
export async function saveEbayListingMetadata(listingId: string, metadata: EbayListingMetadata) {
  return apiRequest<{ platform_data: Record<string, unknown> }>("PATCH", `/api/listings/${listingId}/ebay-metadata`, metadata);
}
```

```tsx
// apps/mobile/components/EbayMetadataEditor.tsx
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import type { EbayListingMetadata } from "@/lib/types";

type Props = {
  metadata: EbayListingMetadata;
  visible: boolean;
  saving: boolean;
  onChange: (next: EbayListingMetadata) => void;
  onSave: () => void;
};

export default function EbayMetadataEditor({ metadata, visible, saving, onChange, onSave }: Props) {
  if (!visible) return null;
  return (
    <View>
      <Text>eBay details</Text>
      <TextInput
        accessibilityLabel="Department"
        value={metadata.ebayAspects?.Department?.[0] ?? ""}
        onChangeText={(value) => onChange({
          ...metadata,
          ebayAspects: { ...(metadata.ebayAspects ?? {}), Department: value ? [value] : [] },
          metadataSources: { ...(metadata.metadataSources ?? {}), Department: "user" },
        })}
      />
      <Pressable onPress={onSave} disabled={saving}>
        <Text>{saving ? "Saving..." : "Save eBay details"}</Text>
      </Pressable>
    </View>
  );
}
```

- [ ] **Step 4: Wire listing/settings UI and mock helpers**

```ts
// apps/e2e/tests/helpers.ts
export async function seedEbayConnection(request: APIRequestContext, input: { ready: boolean; missing?: string[] }) {
  await request.post(`${API}/api/connect`, {
    headers: MOCK_HEADERS,
    data: { platform: "ebay", authorizationCode: "mock-ebay-code", ruName: "mock-ebay-ru-name" },
  });

  if (input.ready === false) {
    await request.patch(`${API}/api/test/connection/ebay-readiness`, {
      headers: MOCK_HEADERS,
      data: { ready: false, missing: input.missing ?? [] },
    });
  }
}
```

```tsx
// apps/mobile/app/listing/[id].tsx
const [ebayMetadataVisible, setEbayMetadataVisible] = useState(false);
const [ebayMetadata, setEbayMetadata] = useState<EbayListingMetadata>({});

async function handlePublish(platform: Platform) {
  setPublishing(platform);
  try {
    const result = await publishListing(id, [platform], publishMode);
    const platformResult = result.results[platform] as {
      ok: boolean;
      error?: string;
      metadataRequired?: boolean;
      platformData?: Record<string, unknown>;
    };

    if (!platformResult.ok && platform === "ebay") {
      setEbayMetadataVisible(true);
      if (platformResult.platformData) setEbayMetadata(platformResult.platformData as EbayListingMetadata);
      showToast(platformResult.error ?? "eBay listing needs more details.");
    }
    await load();
  } finally {
    setPublishing(null);
  }
}
```

```tsx
// apps/mobile/app/(tabs)/settings.tsx
{connection?.platform === "ebay" && connection.readiness && (
  <Text style={styles.mockHint}>
    {connection.readiness.ready
      ? "Seller setup ready"
      : `Seller setup incomplete: ${connection.readiness.missing.join(", ")}`}
  </Text>
)}
```

- [ ] **Step 5: Run typecheck and mock E2E**

Run:
```bash
cd apps/mobile && npx tsc --noEmit
cd ../e2e && npx playwright test tests/ebay-publish.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/lib/types.ts apps/mobile/lib/api.ts apps/mobile/components/EbayMetadataEditor.tsx apps/mobile/app/listing/[id].tsx apps/mobile/app/(tabs)/settings.tsx apps/e2e/tests/helpers.ts apps/e2e/tests/ebay-publish.spec.ts
git commit -m "feat: surface ebay readiness and listing metadata in mobile ui"
```

### Task 7: Add live Playwright publish smoke and deterministic Maestro PR CI

**Files:**
- Modify: `apps/e2e/tests/live-helpers.ts`
- Create: `apps/e2e/tests/ebay-publish.live.spec.ts`
- Create: `.github/workflows/maestro-ios.yml`
- Modify: `apps/mobile/.maestro/README.md`

- [ ] **Step 1: Write the failing live Playwright spec and CI workflow**

```ts
// apps/e2e/tests/ebay-publish.live.spec.ts
import { test, expect } from "@playwright/test";
import { createListing, getClerkToken, captureEbaySandboxAuthorizationCode, connectEbayThroughApi } from "./live-helpers";

test("publishes a single listing to ebay sandbox through the live api", async ({ page, request }) => {
  await page.goto("/");
  const token = await getClerkToken(page);

  const { authorizationCode, ruName } = await captureEbaySandboxAuthorizationCode(page);
  await connectEbayThroughApi(request, token, { authorizationCode, ruName });

  const listing = await createListing(page, request, {
    title: `Live eBay publish ${Date.now()}`,
    category: "tops.hoodie",
    brand: "Nike",
    size: "M",
    traits: { color: "Black", department: "Men" },
  });

  const response = await request.fetch(`${process.env.E2E_API_URL}/api/publish`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    data: { listingId: listing.id, platforms: ["ebay"], mode: "draft" },
  });

  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data.results.ebay.ok).toBe(true);
  expect(data.results.ebay.remoteState).toBe("draft");
});
```

```yaml
# .github/workflows/maestro-ios.yml
name: Maestro iOS

on:
  pull_request:
    branches: [main]
    paths:
      - "apps/mobile/**"
      - "apps/server/**"
      - "apps/mobile/.maestro/**"
      - ".github/workflows/**"

jobs:
  maestro-deterministic:
    runs-on: macos-15
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - name: Install dependencies
        run: npm ci
      - name: Install Maestro
        run: curl -Ls "https://get.maestro.mobile.dev" | bash
      - name: Boot simulator
        run: |
          xcrun simctl boot "iPhone 16" || true
          open -a Simulator
      - name: Build iOS dev client
        run: cd apps/mobile && npx expo run:ios --simulator "iPhone 16"
      - name: Start mock server
        run: cd apps/server && (MOCK_MODE=1 npm run dev > /tmp/server.log 2>&1 &)
      - name: Start Metro
        run: cd apps/mobile && (EXPO_PUBLIC_API_URL=http://127.0.0.1:3001 EXPO_PUBLIC_MOCK_MODE=1 EXPO_PUBLIC_MOCK_USER_ID=maestro-user EXPO_PUBLIC_EBAY_E2E_MODE=1 EXPO_PUBLIC_EBAY_TEST_STATE=maestro-ebay-state npx expo start --dev-client --port 8083 > /tmp/metro.log 2>&1 &)
      - name: Run deterministic Maestro
        run: cd apps/mobile && PATH="$PATH:$HOME/.maestro/bin" npm run maestro:ebay:deterministic
      - name: Upload Maestro artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: maestro-artifacts
          path: |
            /tmp/server.log
            /tmp/metro.log
            ~/.maestro/tests
```

- [ ] **Step 2: Run the new verifications locally to confirm they fail for the expected reasons**

Run:
```bash
cd apps/e2e && E2E_BASE_URL=http://127.0.0.1:8082 E2E_API_URL=http://127.0.0.1:3001 E2E_EMAIL="$CLERK_TEST_USER" E2E_PASSWORD="$CLERK_TEST_PASSWORD" E2E_EBAY_TEST=1 E2E_EBAY_SANDBOX=true E2E_EBAY_CALLBACK_HOST=https://vibelyster.vercel.app E2E_EBAY_CLIENT_ID="$EBAY_CLIENT_ID" E2E_EBAY_RU_NAME="$EXPO_PUBLIC_EBAY_RU_NAME" E2E_EBAY_SANDBOX_USERNAME="$EBAY_SANDBOX_USER" E2E_EBAY_SANDBOX_PASSWORD="$EBAY_SANDBOX_PASSWORD" npx playwright test tests/ebay-publish.live.spec.ts --project=chromium
```

Expected: FAIL before implementation if `/api/publish` still rejects or metadata is incomplete.

- [ ] **Step 3: Implement the live helper additions and CI workflow**

```ts
// apps/e2e/tests/live-helpers.ts
export async function publishListingViaApi(
  request: APIRequestContext,
  token: string,
  input: { listingId: string; mode?: "live" | "draft" },
) {
  return api<{ results: Record<string, unknown> }>(request, token, "POST", "/api/publish", {
    listingId: input.listingId,
    platforms: ["ebay"],
    mode: input.mode ?? "draft",
  });
}
```

Update `apps/mobile/.maestro/README.md` with CI notes and the requirement that deterministic CI uses the connect-only smoke flow.

- [ ] **Step 4: Run the final verification suite**

Run:
```bash
cd apps/server && npm test
cd ../mobile && npx tsc --noEmit
cd ../e2e && npx playwright test tests/ebay-publish.spec.ts
cd ../e2e && E2E_BASE_URL=http://127.0.0.1:8082 E2E_API_URL=http://127.0.0.1:3001 E2E_EMAIL="$CLERK_TEST_USER" E2E_PASSWORD="$CLERK_TEST_PASSWORD" E2E_EBAY_TEST=1 E2E_EBAY_SANDBOX=true E2E_EBAY_CALLBACK_HOST=https://vibelyster.vercel.app E2E_EBAY_CLIENT_ID="$EBAY_CLIENT_ID" E2E_EBAY_RU_NAME="$EXPO_PUBLIC_EBAY_RU_NAME" E2E_EBAY_SANDBOX_USERNAME="$EBAY_SANDBOX_USER" E2E_EBAY_SANDBOX_PASSWORD="$EBAY_SANDBOX_PASSWORD" npx playwright test tests/ebay-publish.live.spec.ts --project=chromium
cd ../mobile && PATH="$PATH:$HOME/.maestro/bin" npm run maestro:ebay:deterministic
```

Expected:
- server tests PASS
- mobile typecheck PASS
- mock Playwright eBay publish spec PASS
- live Playwright eBay publish spec PASS
- deterministic Maestro PASS

- [ ] **Step 5: Commit**

```bash
git add apps/e2e/tests/live-helpers.ts apps/e2e/tests/ebay-publish.live.spec.ts .github/workflows/maestro-ios.yml apps/mobile/.maestro/README.md
git commit -m "test: add ebay publish live smoke and maestro ios ci"
```

---

## Self-review

- Spec coverage:
  - Single-listing eBay publish: Tasks 2–4, 7
  - Seller readiness detection + Settings status: Tasks 2, 5, 6
  - Listing-level eBay metadata generation/editing: Tasks 3, 5, 6
  - AI fallback for unmapped item specifics: Task 3
  - Draft/live support: Task 4 + Task 7
  - Deterministic Maestro PR CI: Task 7
- Placeholder scan: no TBD/TODO markers remain.
- Type consistency: shared eBay types are introduced in Task 1 and reused consistently in later tasks.
