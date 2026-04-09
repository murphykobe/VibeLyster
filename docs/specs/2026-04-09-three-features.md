# Feature Spec: Structured Sizes, Transcription Logging, Async Generate

## Feature 1: Structured Size Validation

Currently size is a free-form string. Change it to `{ system, value }`.

**Implementation note (agreed update):** use **strict system + flexible value**. The size system should be constrained by category group, but the size value should be treated as a guided/common-value suggestion rather than a tiny closed enum that rejects real marketplace sizes.

### 1a. New file: `apps/server/lib/sizes.ts`

**Nice-to-have / follow-up TODO:** expand the suggested values and labels in `sizes.ts` to better match real Grailed size dropdown coverage. For now, the current lists are treated as common suggestions for picker UX, not exhaustive validation gates.

Size systems and valid values:

- `US_MENS_SHOE`: 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 13, 14, 15
- `US_WOMENS_SHOE`: 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 12
- `EU_SHOE`: 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48
- `UK_SHOE`: 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 12, 13
- `CLOTHING_LETTER`: XXS, XS, S, M, L, XL, XXL, XXXL
- `PANTS_WAIST`: 26, 27, 28, 29, 30, 31, 32, 33, 34, 36, 38, 40, 42
- `EU_CLOTHING`: 44, 46, 48, 50, 52, 54, 56
- `IT_CLOTHING`: 44, 46, 48, 50, 52, 54, 56
- `ONE_SIZE`: ONE SIZE

Category group to valid size systems:

- footwear → US_MENS_SHOE, US_WOMENS_SHOE, EU_SHOE, UK_SHOE
- tops, outerwear, tailoring → CLOTHING_LETTER, EU_CLOTHING, IT_CLOTHING
- bottoms → PANTS_WAIST, CLOTHING_LETTER, EU_CLOTHING
- accessories, bags → ONE_SIZE, CLOTHING_LETTER

Exports: `SizeSystem` type, `StructuredSize = { system: SizeSystem; value: string }`, `getSizeSystemsForCategory(categoryKey)`, `getValuesForSystem(system)`, `ALL_SIZE_SYSTEMS`.

### 1b. `apps/server/lib/ai.ts`

- Change `ListingSchema.size` from `z.string().nullable()` to:
  ```ts
  z.object({
    system: z.string(),
    value: z.string(),
  }).nullable().describe('Structured size with system (e.g. US_MENS_SHOE, CLOTHING_LETTER, PANTS_WAIST) and value. null if unknown.')
  ```
- Update `SYSTEM_PROMPT` (~line 236) to list valid size systems and example values
- Update `hasFieldValue` for `"size"` case (~line 294): `Boolean(listing.size?.system && listing.size?.value)`

### 1c. `apps/server/lib/db.ts` and `db.mock.ts`

- Size column is TEXT in postgres. Store structured size via `JSON.stringify()`.
- `createListing`: pass `JSON.stringify(input.size)` for the size column
- `updateListing`: same `JSON.stringify` treatment
- `CreateListingInput.size`: `{ system: string; value: string } | string | null`

### 1d. `apps/server/app/api/generate/route.ts`

- `GeneratedDraft.size`: `{ system: string; value: string } | null`
- `createListing` call: `size: generated.listing.size ? JSON.stringify(generated.listing.size) : undefined`
- `buildMockListing`: change `size: "M"` to `size: JSON.stringify({ system: "CLOTHING_LETTER", value: "M" })`

### 1e. `apps/mobile/lib/types.ts`

- `Listing.size`: `{ system: string; value: string } | string | null`

### 1f. `apps/mobile/app/listing/[id].tsx`

- Replace size `TextInput` (~line 416) with structured size editing:
  1. Size system picker (filtered by current category group)
  2. Size value input with common suggested values for the selected system
- State: `sizeSystem` and `sizeValue` instead of single `size` string
- `hydrateListing`: parse size (try `JSON.parse` if string, or use object directly)
- `handleSave`: send `{ system: sizeSystem, value: sizeValue }`
- Backwards compat: if size is a plain string, show it as-is with option to re-select

### 1g. Copy `apps/server/lib/sizes.ts` → `apps/mobile/lib/sizes.ts`

### 1h. Marketplace compatibility

- Before publish, convert stored structured sizes back to a plain display string for marketplace clients
- Do this generically in shared publish paths, not via eBay-specific special treatment

---

## Feature 2: Transcription Latency Logging

All changes in `apps/server/lib/ai.ts`.

### 2a. `transcribeAudio` function (~line 155)

Add `const startMs = Date.now()` at top. Log after each phase:

```ts
// After file upload (~line 177):
console.log(JSON.stringify({ event: "ai.transcription.upload_complete", latency_ms: Date.now() - startMs }));

// After transcription create (~line 196):
console.log(JSON.stringify({ event: "ai.transcription.create_complete", latency_ms: Date.now() - startMs }));

// After polling loop (~line 218):
console.log(JSON.stringify({ event: "ai.transcription.poll_complete", latency_ms: Date.now() - startMs, poll_attempts: attempt }));

// Before return:
console.log(JSON.stringify({ event: "ai.transcription.total", latency_ms: Date.now() - startMs, transcript_length: transcript.text.trim().length }));
```

### 2b. `generateListing` function (~line 480)

- Add `const generateStartMs = Date.now()` at top
- Track transcription time in a variable `transcriptionMs`
- Replace existing `ai.transcription_complete` log (line ~486):
  ```ts
  console.log(JSON.stringify({ event: "ai.transcription_complete", transcript_length: transcript.length, transcription_latency_ms: transcriptionMs }));
  ```
- Declare `let pass2LatencyMs: number | null = null` before the `if (useVision)` block, set inside
- Add total latency log before return (~line 590):
  ```ts
  console.log(JSON.stringify({ event: "ai.generate_total", total_ms: Date.now() - generateStartMs, transcription_ms: transcriptionMs ?? null, pass1_ms: pass1LatencyMs, pass2_ms: pass2LatencyMs }));
  ```

---

## Feature 3: Async Generate Flow

### 3a. Schema (`apps/server/lib/schema.sql`)

Add to `listings` table:

```sql
generation_status TEXT NOT NULL DEFAULT 'complete' CHECK (generation_status IN ('generating', 'complete', 'failed')),
generation_error TEXT
```

### 3b. `apps/server/lib/db.ts`

- Add `generation_status` and `generation_error` to `ListingRow`
- Add `generation_status?: string` to `CreateListingInput`
- Add to `createListing` INSERT columns
- New function:
  ```ts
  export async function updateListingGeneration(listingId: string, updates: {
    generation_status: string;
    generation_error?: string | null;
    title?: string | null;
    description?: string | null;
    price?: number | null;
    size?: string | null;
    condition?: string | null;
    brand?: string | null;
    category?: string | null;
    traits?: Record<string, unknown>;
    voiceTranscript?: string | null;
    aiRawResponse?: Record<string, unknown> | null;
  })
  ```

### 3c. `apps/server/lib/db.mock.ts`

- Add `generation_status` and `generation_error` to types and `createListing`
- Add `updateListingGeneration` function

### 3d. `apps/server/app/api/generate/route.ts`

- **Phase 1** (sync): Create placeholder listing with `generation_status: 'generating'`, photos, userId. Return 201 immediately.
- **Phase 2** (fire-and-forget): Async block runs `generateListing`, then `updateListingGeneration` with results + `generation_status: 'complete'`. On error: `generation_status: 'failed'`, `generation_error: err.message`.
- Mock mode: keep synchronous, `generation_status: 'complete'`.

### 3e. `apps/server/app/api/status/[id]/route.ts`

- Add `generation_status` and `generation_error` to response JSON

### 3f. `apps/mobile/lib/types.ts`

```ts
generation_status: 'generating' | 'complete' | 'failed';
generation_error: string | null;
```

### 3g. `apps/mobile/app/listing/[id].tsx`

- If `generation_status === 'generating'`: show banner, disable editing, poll `GET /api/status/:id` every 2s, reload when complete
- If `generation_status === 'failed'`: show error with `generation_error`

### 3h. `apps/mobile/app/(tabs)/index.tsx`

- Listings with `generation_status === 'generating'`: show spinner overlay or badge on the card
