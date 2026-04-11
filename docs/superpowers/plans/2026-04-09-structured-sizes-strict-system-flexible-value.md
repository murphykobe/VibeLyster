# Structured Sizes (Strict System, Flexible Value) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-form listing sizes with a structured `{ system, value }` model while keeping value validation flexible enough for real marketplace usage.

**Architecture:** Reuse the existing `sizes.ts` scaffolding for allowed size systems and suggested values, but do not hard-reject values outside a closed enum. Store structured sizes as JSON strings in the database, add parse/display helpers so marketplace publish still receives a plain display string, and update the mobile listing editor to edit system + value separately with backwards compatibility for older string sizes.

**Tech Stack:** TypeScript, Zod, Next.js route handlers, React Native, Expo Router, existing server Vitest suite

---

## File Structure

- Modify: `apps/server/lib/sizes.ts`
  - keep system definitions and suggested values
  - add parse/display helpers for structured size JSON and user-facing strings
- Modify: `apps/mobile/lib/sizes.ts`
  - mirror parse/display helpers for mobile editor hydration
- Modify: `apps/server/lib/ai.ts`
  - keep structured size schema, but relax value validation to flexible per-system strings
  - normalize system names and value casing without requiring a small closed list
- Modify: `apps/server/lib/marketplace/types.ts`
  - keep marketplace canonical listing `size` as plain display string for marketplace clients
- Modify: `apps/server/app/api/publish/route.ts`
- Modify: `apps/server/app/api/publish/bulk/route.ts`
  - parse JSON-stored structured sizes into display strings before publish
- Modify: `apps/server/lib/marketplace/ebay-metadata.ts`
  - continue using display string size for aspect generation
- Modify: `apps/server/lib/db.ts`
- Modify: `apps/server/lib/db.mock.ts`
  - keep JSON-string storage for structured sizes
- Modify: `apps/server/lib/validation.ts`
  - keep accepting string-or-structured size bodies for backward compatibility
- Modify: `apps/mobile/lib/types.ts`
- Modify: `apps/mobile/lib/api.ts`
  - keep structured size typing consistent
- Modify: `apps/mobile/app/listing/[id].tsx`
  - replace the size text input with system/value pickers and backward-compatible hydration
- Test: `apps/server/lib/__tests__/ai.test.ts`
- Test: `apps/server/app/api/__tests__/routes.test.ts`
- Create: `apps/server/lib/__tests__/sizes.test.ts`

## Critical Design Decisions

- **Strict system, flexible value:** only the `system` is enum-like; `value` is normalized but not restricted to a tiny hardcoded list.
- **Suggested values, not exhaustive values:** `getValuesForSystem(system)` feeds the UI picker defaults, but server normalization does not reject uncommon valid values solely because they are absent from the suggestions list.
- **Marketplace compatibility:** publishing still works on plain display strings like `M`, `10.5`, or `one size`; structured sizes are a product-layer/editor concern.
- **Backward compatibility:** old rows with plain string `size` still render and save.

### Task 1: Add size parsing/display helpers and test them

**Files:**
- Modify: `apps/server/lib/sizes.ts`
- Modify: `apps/mobile/lib/sizes.ts`
- Create: `apps/server/lib/__tests__/sizes.test.ts`

- [ ] **Step 1: Write failing server tests for size parsing/display helpers**

Create `apps/server/lib/__tests__/sizes.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  getSizeSystemsForCategory,
  getValuesForSystem,
  parseStructuredSize,
  toDisplaySize,
} from "../sizes";

describe("sizes helpers", () => {
  it("returns allowed size systems for a category group", () => {
    expect(getSizeSystemsForCategory("footwear.boots")).toContain("US_MENS_SHOE");
    expect(getSizeSystemsForCategory("tops.t_shirt")).toContain("CLOTHING_LETTER");
  });

  it("parses a JSON string structured size", () => {
    expect(parseStructuredSize('{"system":"CLOTHING_LETTER","value":"M"}')).toEqual({
      system: "CLOTHING_LETTER",
      value: "M",
    });
  });

  it("returns null for invalid JSON size payloads", () => {
    expect(parseStructuredSize('{"system":1}')).toBeNull();
    expect(parseStructuredSize('not-json')).toBeNull();
  });

  it("formats a structured size for marketplace display", () => {
    expect(toDisplaySize({ system: "ONE_SIZE", value: "ONE SIZE" })).toBe("one size");
    expect(toDisplaySize({ system: "US_MENS_SHOE", value: "10.5" })).toBe("10.5");
  });

  it("passes through legacy string sizes for display", () => {
    expect(toDisplaySize("XL")).toBe("XL");
  });

  it("exposes suggested values for picker UIs", () => {
    expect(getValuesForSystem("CLOTHING_LETTER")).toContain("M");
  });
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
cd /Users/murphy/workplace/VibeLyster/apps/server
npx vitest run lib/__tests__/sizes.test.ts
```

Expected: FAIL because `parseStructuredSize` and `toDisplaySize` do not yet exist.

- [ ] **Step 3: Implement minimal parsing/display helpers in `apps/server/lib/sizes.ts`**

Add these exports:

```ts
export type SizeSystem = keyof typeof SIZE_SYSTEMS;
export type StructuredSize = { system: SizeSystem; value: string };

export function parseStructuredSize(size: unknown): StructuredSize | null {
  if (!size) return null;
  if (typeof size === "object") {
    const candidate = size as Partial<StructuredSize>;
    if (typeof candidate.system === "string" && candidate.system in SIZE_SYSTEMS && typeof candidate.value === "string") {
      const value = candidate.value.trim();
      if (!value) return null;
      return { system: candidate.system as SizeSystem, value };
    }
    return null;
  }

  if (typeof size !== "string") return null;
  try {
    return parseStructuredSize(JSON.parse(size));
  } catch {
    return null;
  }
}

export function toDisplaySize(size: StructuredSize | string | null | undefined): string | null {
  if (!size) return null;
  if (typeof size === "string") return size.trim() || null;
  if (size.system === "ONE_SIZE") return "one size";
  return size.value.trim() || null;
}
```

Keep existing `SIZE_SYSTEMS`, `ALL_SIZE_SYSTEMS`, `getSizeSystemsForCategory`, and `getValuesForSystem` exports.

- [ ] **Step 4: Mirror the same helpers in `apps/mobile/lib/sizes.ts`**

Copy the helper implementations from server to mobile so the listing editor can hydrate legacy strings and structured JSON safely.

- [ ] **Step 5: Run the helper test to verify it passes**

Run:

```bash
cd /Users/murphy/workplace/VibeLyster/apps/server
npx vitest run lib/__tests__/sizes.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit Task 1**

```bash
git add apps/server/lib/sizes.ts apps/mobile/lib/sizes.ts apps/server/lib/__tests__/sizes.test.ts
git commit -m "feat: add structured size parsing helpers"
```

### Task 2: Make AI size normalization strict on system but flexible on value

**Files:**
- Modify: `apps/server/lib/ai.ts`
- Test: `apps/server/lib/__tests__/ai.test.ts`

- [ ] **Step 1: Write failing AI tests for flexible structured size normalization**

Extend `apps/server/lib/__tests__/ai.test.ts` with tests for `normalizeStructuredSize` behavior through public generation helpers. If `normalizeStructuredSize` is not exported, export a small helper such as `normalizeGeneratedSizeForTest` strictly for reuse in tests.

Use tests like:

```ts
it("accepts a structured clothing size with a valid system even when the value is not in the suggestion list", () => {
  expect(normalizeGeneratedSizeForTest(
    { system: "CLOTHING_LETTER", value: "MEDIUM" },
    "tops.t_shirt",
  )).toEqual({ system: "CLOTHING_LETTER", value: "MEDIUM" });
});

it("rejects a size system that is not allowed for the category group", () => {
  expect(normalizeGeneratedSizeForTest(
    { system: "US_MENS_SHOE", value: "10" },
    "tops.t_shirt",
  )).toBeNull();
});

it("normalizes one size casing for structured values", () => {
  expect(normalizeGeneratedSizeForTest(
    { system: "ONE_SIZE", value: "one size" },
    "bags.duffel",
  )).toEqual({ system: "ONE_SIZE", value: "ONE SIZE" });
});
```

- [ ] **Step 2: Run the targeted AI test file to verify red**

Run:

```bash
cd /Users/murphy/workplace/VibeLyster/apps/server
npx vitest run lib/__tests__/ai.test.ts
```

Expected: FAIL because current normalization still rejects values not in `getValuesForSystem(system)`.

- [ ] **Step 3: Update `apps/server/lib/ai.ts` normalization logic**

In `normalizeStructuredSize(...)`:
- keep system normalization and category-group checks
- remove the hard rejection based on `getValuesForSystem(system).includes(value)`
- normalize casing only:
  - `CLOTHING_LETTER` and `ONE_SIZE` -> uppercase
  - numeric/text systems -> trimmed original value
- keep returning `null` for empty values or invalid systems

Also update the prompt text so the values shown are **examples / common values**, not an exhaustive allowed list.

- [ ] **Step 4: Re-run AI tests to verify green**

Run:

```bash
cd /Users/murphy/workplace/VibeLyster/apps/server
npx vitest run lib/__tests__/ai.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit Task 2**

```bash
git add apps/server/lib/ai.ts apps/server/lib/__tests__/ai.test.ts
git commit -m "fix: relax structured size value validation"
```

### Task 3: Keep publish flows working with JSON-stored sizes

**Files:**
- Modify: `apps/server/lib/marketplace/types.ts`
- Modify: `apps/server/app/api/publish/route.ts`
- Modify: `apps/server/app/api/publish/bulk/route.ts`
- Modify: `apps/server/lib/marketplace/ebay-metadata.ts`
- Test: `apps/server/app/api/__tests__/routes.test.ts`

- [ ] **Step 1: Write a failing route test proving structured-size listings can still publish in mock mode**

Add a test to `apps/server/app/api/__tests__/routes.test.ts`:

```ts
it("publishes a listing with a structured size stored in the DB", async () => {
  const createRes = await createListing(req("POST", "/api/listings", {
    body: {
      ...VALID_LISTING,
      size: { system: "CLOTHING_LETTER", value: "M" },
    },
  }));
  const { id } = await createRes.json();
  await connectPlatform(req("POST", "/api/connect", { body: { platform: "grailed", tokens: { csrf_token: "x", cookies: "y" } } }));

  const res = await publishListing(req("POST", "/api/publish", { body: { listingId: id, platforms: ["grailed"] } }));
  expect(res.status).toBe(200);
  const data = await res.json();
  expect(data.results.grailed.ok).toBe(true);
});
```

- [ ] **Step 2: Run the route test to verify red if publish uses raw JSON strings**

Run:

```bash
cd /Users/murphy/workplace/VibeLyster/apps/server
npx vitest run app/api/__tests__/routes.test.ts
```

Expected: FAIL if structured size serialization reaches publish unchanged or if any type mismatch is exposed.

- [ ] **Step 3: Parse structured sizes into display strings in publish paths**

In both `apps/server/app/api/publish/route.ts` and `apps/server/app/api/publish/bulk/route.ts`:
- import `toDisplaySize` and `parseStructuredSize` from `@/lib/sizes`
- set canonical `size` using:

```ts
size: toDisplaySize(parseStructuredSize(dbListing.size) ?? dbListing.size),
```

Keep `CanonicalListing.size` as `string | null` in `apps/server/lib/marketplace/types.ts`.

- [ ] **Step 4: Re-run route tests to verify green**

Run:

```bash
cd /Users/murphy/workplace/VibeLyster/apps/server
npx vitest run app/api/__tests__/routes.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit Task 3**

```bash
git add apps/server/app/api/publish/route.ts apps/server/app/api/publish/bulk/route.ts apps/server/lib/marketplace/types.ts apps/server/app/api/__tests__/routes.test.ts
git commit -m "fix: parse structured sizes before marketplace publish"
```

### Task 4: Replace mobile size text input with structured system/value editing

**Files:**
- Modify: `apps/mobile/app/listing/[id].tsx`
- Modify: `apps/mobile/lib/types.ts`
- Modify: `apps/mobile/lib/api.ts`
- Modify: `apps/mobile/components/ListingCard.tsx` only if size display needs adjustment
- Verify: `cd apps/mobile && npx tsc --noEmit`

- [ ] **Step 1: Add size hydration helpers in `listing/[id].tsx` using `apps/mobile/lib/sizes.ts`**

Add imports:

```ts
import { getSizeSystemsForCategory, getValuesForSystem, parseStructuredSize, toDisplaySize, type SizeSystem } from "@/lib/sizes";
```

Replace:

```ts
const [size, setSize] = useState("");
```

with:

```ts
const [sizeSystem, setSizeSystem] = useState<SizeSystem | "">("");
const [sizeValue, setSizeValue] = useState("");
const [legacySizeText, setLegacySizeText] = useState<string | null>(null);
```

In `hydrateListing(data)` parse size like:

```ts
const parsedSize = parseStructuredSize(data.size);
setSizeSystem(parsedSize?.system ?? "");
setSizeValue(parsedSize?.value ?? "");
setLegacySizeText(parsedSize ? null : toDisplaySize(data.size));
```

- [ ] **Step 2: Replace the size `TextInput` with system/value selectors**

Replace the existing size field block with:

```tsx
<Field label="Size">
  {legacySizeText ? (
    <Text style={styles.categorySummary}>Existing size: {legacySizeText}</Text>
  ) : null}

  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
    {getSizeSystemsForCategory(category).map((system) => (
      <Pressable
        key={system}
        onPress={() => {
          setSizeSystem(system);
          setLegacySizeText(null);
          if (!getValuesForSystem(system).includes(sizeValue)) {
            setSizeValue(getValuesForSystem(system)[0] ?? "");
          }
        }}
        style={[styles.chip, sizeSystem === system && styles.chipActive]}
      >
        <Text style={[styles.chipText, sizeSystem === system && styles.chipTextActive]}>{system}</Text>
      </Pressable>
    ))}
  </ScrollView>

  {sizeSystem ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
      {getValuesForSystem(sizeSystem).map((value) => (
        <Pressable
          key={value}
          onPress={() => {
            setSizeValue(value);
            setLegacySizeText(null);
          }}
          style={[styles.chip, sizeValue === value && styles.chipActive]}
        >
          <Text style={[styles.chipText, sizeValue === value && styles.chipTextActive]}>{value}</Text>
        </Pressable>
      ))}
    </ScrollView>
  ) : (
    <Text style={styles.categorySummary}>Choose a category to unlock size systems.</Text>
  )}
</Field>
```

- [ ] **Step 3: Save structured size bodies instead of plain strings**

In `handleSave()`, replace `size` with:

```ts
size: sizeSystem && sizeValue ? { system: sizeSystem, value: sizeValue } : legacySizeText,
```

- [ ] **Step 4: Run mobile typecheck to verify green**

Run:

```bash
cd /Users/murphy/workplace/VibeLyster/apps/mobile
npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 5: Commit Task 4**

```bash
git add apps/mobile/app/listing/[id].tsx apps/mobile/lib/types.ts apps/mobile/lib/api.ts apps/mobile/lib/sizes.ts
git commit -m "feat: add structured size editing in mobile listing detail"
```

### Task 5: Final verification for structured sizes

**Files:**
- Verify all touched files above

- [ ] **Step 1: Run focused server tests**

Run:

```bash
cd /Users/murphy/workplace/VibeLyster/apps/server
npx vitest run lib/__tests__/sizes.test.ts lib/__tests__/ai.test.ts app/api/__tests__/routes.test.ts
```

Expected: PASS

- [ ] **Step 2: Run full server tests**

Run:

```bash
cd /Users/murphy/workplace/VibeLyster/apps/server
npm test
```

Expected: PASS

- [ ] **Step 3: Run server and mobile typechecks**

Run:

```bash
cd /Users/murphy/workplace/VibeLyster
npx tsc --noEmit -p apps/server/tsconfig.json
cd apps/mobile && npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 4: Manual smoke check**

Manual checks:
1. Open a listing with a legacy string size and confirm it still loads
2. Change category and select a size system/value
3. Save and reload the listing
4. Confirm the structured size persists
5. Confirm publish still uses a plain display size rather than raw JSON

- [ ] **Step 5: Commit any final polish fixes**

```bash
git add apps/server apps/mobile
git commit -m "fix: finalize structured size flow"
```

## Self-Review

- Spec coverage:
  - structured size model: covered
  - strict system + flexible value: covered
  - mobile editor system/value pickers: covered
  - DB JSON storage: already present and preserved
  - publish compatibility: covered
- Placeholder scan: no TBD/TODO placeholders remain
- Type consistency:
  - `StructuredSize` is reused across helper modules
  - marketplace canonical listing remains plain string size
  - mobile editor sends `{ system, value } | string | null`
