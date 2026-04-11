# Apparel Size UX Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify app-facing size UX by normalizing apparel tops to a single letter-size scale, keeping bottoms on waist sizing, and replacing all-caps enum labels with human-readable labels in the mobile app.

**Architecture:** Keep internal size system keys unchanged in storage and server contracts, but introduce app-facing display labels and normalization helpers. The server AI normalization path will translate apparel inputs such as EU/IT clothing sizes into canonical clothing-letter sizes before they reach the app UX, while bottoms continue using waist sizing. The mobile listing editor will expose only the systems relevant to the user-facing experience: Top Size, Bottom Size, or generic Size.

**Tech Stack:** TypeScript, Vitest, Next.js route handlers, React Native, Expo Router

---

## File Structure

- Modify: `apps/server/lib/sizes.ts`
  - reduce apparel UX systems to one canonical letter-size path for tops/outerwear/tailoring
  - add clothing-size translation helpers (EU/IT clothing -> letter size)
- Modify: `apps/mobile/lib/sizes.ts`
  - mirror human-readable labels and app-facing allowed systems
- Modify: `apps/server/lib/ai.ts`
  - translate apparel size inputs into canonical clothing-letter values before persistence
- Modify: `apps/server/lib/__tests__/ai.test.ts`
  - add coverage for apparel translation (e.g. EU 48 -> M)
- Modify: `apps/server/lib/__tests__/sizes.test.ts`
  - add coverage for category-visible systems and label-facing helper behavior where applicable
- Modify: `apps/mobile/app/listing/[id].tsx`
  - show Top Size / Bottom Size / Size labels instead of raw enum keys
  - only expose top letter sizes for tops/outerwear/tailoring
  - keep waist sizing for bottoms
- Modify: `apps/mobile/lib/types.ts`
  - keep internal structured size shape unchanged
- Modify: `docs/specs/2026-04-09-three-features.md`
  - keep aligned with the approved UX direction

## Critical Design Decisions

- **UX-only label cleanup:** internal keys like `CLOTHING_LETTER` and `PANTS_WAIST` stay unchanged.
- **Canonical apparel sizing:** tops/outerwear/tailoring normalize to clothing-letter sizes only: `XS, S, M, L, XL, XXL, 3XL`.
- **Bottoms remain numeric:** do not collapse waist sizes into letter sizes.
- **Generic labels where appropriate:** shoes/accessories use `Size`; tops use `Top Size`; bottoms use `Bottom Size`.
- **Translation happens before UX display:** if AI extracts an apparel size like `EU 48`, server normalization converts it to the canonical letter size (`M`) before the app renders it.

### Task 1: Add failing tests for apparel size translation and visible size systems

**Files:**
- Modify: `apps/server/lib/__tests__/sizes.test.ts`
- Modify: `apps/server/lib/__tests__/ai.test.ts`

- [ ] **Step 1: Write failing tests for category-visible systems in `apps/server/lib/__tests__/sizes.test.ts`**

Add tests like:

```ts
it("shows only clothing letter sizes for tops", () => {
  expect(getSizeSystemsForCategory("tops.t_shirt")).toEqual(["CLOTHING_LETTER"]);
});

it("keeps waist sizing first for bottoms", () => {
  expect(getSizeSystemsForCategory("bottoms.denim")).toContain("PANTS_WAIST");
});
```

- [ ] **Step 2: Write failing AI normalization tests in `apps/server/lib/__tests__/ai.test.ts`**

Add tests like:

```ts
it("translates eu clothing sizes into canonical letter sizes for tops", () => {
  expect(normalizeGeneratedSizeForTest(
    { system: "EU_CLOTHING", value: "48" },
    "tops.t_shirt",
  )).toEqual({ system: "CLOTHING_LETTER", value: "M" });
});

it("translates italian clothing sizes into canonical letter sizes for outerwear", () => {
  expect(normalizeGeneratedSizeForTest(
    { system: "IT_CLOTHING", value: "48" },
    "outerwear.light_jacket",
  )).toEqual({ system: "CLOTHING_LETTER", value: "M" });
});

it("does not collapse bottom waist sizes into top letter sizes", () => {
  expect(normalizeGeneratedSizeForTest(
    { system: "PANTS_WAIST", value: "32" },
    "bottoms.denim",
  )).toEqual({ system: "PANTS_WAIST", value: "32" });
});
```

- [ ] **Step 3: Run targeted tests to verify red**

Run:

```bash
cd /Users/murphy/workplace/VibeLyster/apps/server
npx vitest run lib/__tests__/sizes.test.ts lib/__tests__/ai.test.ts
```

Expected: FAIL because tops currently still allow multiple systems and apparel translation is not implemented.

- [ ] **Step 4: Commit the failing-test checkpoint if useful locally (optional)**

```bash
git add apps/server/lib/__tests__/sizes.test.ts apps/server/lib/__tests__/ai.test.ts
git commit -m "test: define apparel size normalization behavior"
```

### Task 2: Implement canonical apparel size translation on the server

**Files:**
- Modify: `apps/server/lib/sizes.ts`
- Modify: `apps/server/lib/ai.ts`

- [ ] **Step 1: Add translation helpers in `apps/server/lib/sizes.ts`**

Implement a small helper layer such as:

```ts
const CLOTHING_LETTER_VALUES = ["XS", "S", "M", "L", "XL", "XXL", "3XL"] as const;

const EU_TO_TOP_SIZE: Record<string, string> = {
  "44": "XS",
  "46": "S",
  "48": "M",
  "50": "L",
  "52": "XL",
  "54": "XXL",
  "56": "3XL",
};

const US_TO_TOP_SIZE: Record<string, string> = {
  "34": "XS",
  "36": "S",
  "38": "M",
  "40": "L",
  "42": "XL",
  "44": "XXL",
  "46": "3XL",
};

const JP_TO_TOP_SIZE: Record<string, string> = {
  "1": "S",
  "2": "M",
  "3": "L",
  "4": "XL",
  "5": "XXL",
  "6": "3XL",
};

export function isTopCategory(categoryKey: string | null | undefined) {
  const groupKey = categoryKey?.split(".")[0];
  return groupKey === "tops" || groupKey === "outerwear" || groupKey === "tailoring";
}

export function translateApparelSizeToTopSize(system: string, value: string): string | null {
  const normalizedSystem = system.trim().toUpperCase();
  const normalizedValue = value.trim().toUpperCase();
  if (normalizedSystem === "CLOTHING_LETTER") return normalizedValue;
  if (normalizedSystem === "EU_CLOTHING" || normalizedSystem === "IT_CLOTHING") {
    return EU_TO_TOP_SIZE[normalizedValue] ?? null;
  }
  if (normalizedSystem === "US_CLOTHING") {
    return US_TO_TOP_SIZE[normalizedValue] ?? null;
  }
  if (normalizedSystem === "JP_CLOTHING") {
    return JP_TO_TOP_SIZE[normalizedValue] ?? null;
  }
  return null;
}
```

Update category-visible systems so tops/outerwear/tailoring return only `CLOTHING_LETTER` and bottoms keep `PANTS_WAIST` plus any allowed backward-compatible systems you still need internally.

- [ ] **Step 2: Update `normalizeGeneratedSizeForTest` / normalization logic in `apps/server/lib/ai.ts`**

For top categories:
- if system is `CLOTHING_LETTER`, normalize to uppercase and keep it
- if system is `EU_CLOTHING` or `IT_CLOTHING`, translate to `CLOTHING_LETTER`
- if translation succeeds, return `{ system: "CLOTHING_LETTER", value: translated }`
- if translation fails, return `null`

For bottoms:
- preserve `PANTS_WAIST`
- do not remap to `CLOTHING_LETTER`

- [ ] **Step 3: Re-run targeted tests to verify green**

Run:

```bash
cd /Users/murphy/workplace/VibeLyster/apps/server
npx vitest run lib/__tests__/sizes.test.ts lib/__tests__/ai.test.ts
```

Expected: PASS

- [ ] **Step 4: Commit Task 2**

```bash
git add apps/server/lib/sizes.ts apps/server/lib/ai.ts apps/server/lib/__tests__/sizes.test.ts apps/server/lib/__tests__/ai.test.ts
git commit -m "feat: normalize apparel sizes to canonical top sizes"
```

### Task 3: Replace raw enum labels with human-readable app labels

**Files:**
- Modify: `apps/mobile/lib/sizes.ts`
- Modify: `apps/mobile/app/listing/[id].tsx`

- [ ] **Step 1: Add display-label helpers in `apps/mobile/lib/sizes.ts`**

Add helpers like:

```ts
export function getSizeFieldLabel(categoryKey: string | null | undefined): string {
  const groupKey = categoryKey?.split(".")[0];
  if (groupKey === "tops" || groupKey === "outerwear" || groupKey === "tailoring") return "Top Size";
  if (groupKey === "bottoms") return "Bottom Size";
  return "Size";
}

export function getSizeSystemLabel(system: SizeSystem, categoryKey: string | null | undefined): string {
  if (system === "CLOTHING_LETTER") {
    const groupKey = categoryKey?.split(".")[0];
    if (groupKey === "tops" || groupKey === "outerwear" || groupKey === "tailoring") return "Top Size";
    return "Size";
  }
  if (system === "PANTS_WAIST") return "Bottom Size";
  if (system === "ONE_SIZE") return "Size";
  return system.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
```

- [ ] **Step 2: Update the listing detail editor in `apps/mobile/app/listing/[id].tsx`**

Change the size editor so that:
- tops/outerwear/tailoring only expose the clothing-letter scale
- bottoms show waist sizes
- the field header and chip labels use `Top Size`, `Bottom Size`, or `Size`
- no raw enum strings like `CLOTHING_LETTER` or `PANTS_WAIST` are rendered in the app UI

- [ ] **Step 3: Keep backward-compatible hydration behavior**

Retain existing legacy size parsing, but if an older structured top size comes through as `EU_CLOTHING`/`IT_CLOTHING`, normalize it to `CLOTHING_LETTER` in the editor state before rendering.

- [ ] **Step 4: Run mobile typecheck to verify the UI changes compile**

Run:

```bash
cd /Users/murphy/workplace/VibeLyster/apps/mobile
npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 5: Commit Task 3**

```bash
git add apps/mobile/lib/sizes.ts apps/mobile/app/listing/[id].tsx
git commit -m "feat: simplify size labels in the mobile app"
```

### Task 4: Full verification

**Files:**
- Modify: `docs/specs/2026-04-09-three-features.md` if implementation details changed during coding

- [ ] **Step 1: Run the focused server tests**

```bash
cd /Users/murphy/workplace/VibeLyster/apps/server
npx vitest run lib/__tests__/sizes.test.ts lib/__tests__/ai.test.ts
```

Expected: PASS

- [ ] **Step 2: Run the full server suite**

```bash
cd /Users/murphy/workplace/VibeLyster/apps/server
npm test
```

Expected: PASS

- [ ] **Step 3: Run server and mobile typechecks**

```bash
cd /Users/murphy/workplace/VibeLyster
npx tsc --noEmit -p apps/server/tsconfig.json
cd apps/mobile && npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 4: Commit final polish if needed**

```bash
git add docs/specs/2026-04-09-three-features.md
git commit -m "docs: align size ux spec with implementation"
```

## Self-Review

- Spec coverage: this plan covers the approved UX simplification (Top Size / Bottom Size / Size), apparel normalization, and label cleanup.
- Placeholder scan: no TODO/TBD placeholders remain in implementation steps.
- Type consistency: internal `StructuredSize` shape remains unchanged while only display labels and normalization behavior change.
