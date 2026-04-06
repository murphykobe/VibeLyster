# Text-First AI Fallback Listing Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the transcript regex completeness gate with a text-first structured generation pass that can honestly leave unknown fields empty, then run a vision fallback only when image-derivable fields remain unresolved, while logging pass-1 vs fallback behavior and surfacing a simple "Requires verification" UI state.

**Architecture:** Keep Soniox as plain STT. Pass 1 uses a text-only model to produce a partial canonical listing plus internal verification metadata. A deterministic router decides whether images can help; only then does pass 2 call a vision-capable model with the transcript, photos, and partial draft to complete unresolved image-derivable fields. Internal verification metadata is stored in `ai_raw_response`; the mobile UI derives a simple verification badge/state from it.

**Tech Stack:** Next.js route handlers, existing `ai.ts` pipeline, Vercel AI Gateway, Soniox, Vitest, Expo React Native mobile UI.

---

## File structure

### Modify
- `apps/server/lib/ai.ts`
  - replace regex completeness routing with a two-pass generation pipeline
  - export small pure helpers for routing and model selection
- `apps/server/app/api/generate/route.ts`
  - preserve/store richer AI metadata from the new pipeline
- `apps/server/lib/validation.ts`
  - relax listing create validation if needed for explicit null/empty unresolved fields
- `apps/mobile/lib/types.ts`
  - add typed AI verification metadata on listings
- `apps/mobile/app/listing/[id].tsx`
  - derive and display a simple `Requires verification` state from internal metadata

### Create / expand tests
- `apps/server/lib/__tests__/ai.test.ts`
  - route decision tests
  - pass-1 / fallback metadata tests
  - model selection tests

---

## Task 1: Add failing server tests for routing and verification metadata

**Files:**
- Modify: `apps/server/lib/__tests__/ai.test.ts`
- Test: `cd apps/server && npx vitest run lib/__tests__/ai.test.ts`

- [ ] Add a failing test that proves transcript-only generation does not trigger vision when required fields are resolved.
- [ ] Add a failing test that proves unresolved image-derivable fields trigger the vision fallback when photos exist.
- [ ] Add a failing test that proves unresolved non-image-derivable fields (e.g. price only) do not trigger vision fallback.
- [ ] Add a failing test that expects internal metadata with fields like:
  - `verificationStatus`
  - `unresolvedFields`
  - `lowConfidenceFields`
  - `fallbackTriggered`
  - `fallbackResolvedFields`
- [ ] Run the focused test file and confirm failure for the expected reasons.

## Task 2: Implement a text-first pipeline with honest unknowns

**Files:**
- Modify: `apps/server/lib/ai.ts`
- Test: `cd apps/server && npx vitest run lib/__tests__/ai.test.ts`

- [ ] Add a pass-1 output schema that allows nullable/unknown fields and explicit unresolved metadata.
- [ ] Implement text-only generation using the existing text model.
- [ ] Add deterministic routing helpers that decide whether missing fields are image-derivable.
- [ ] Ensure pass 1 does not force guesses for unknown values.
- [ ] Run the focused test file and confirm the pass-1 tests now pass.

## Task 3: Add a vision fallback completion pass

**Files:**
- Modify: `apps/server/lib/ai.ts`
- Test: `cd apps/server && npx vitest run lib/__tests__/ai.test.ts`

- [ ] Add a vision fallback prompt that receives transcript + photos + partial draft.
- [ ] Preserve known fields unless image evidence reasonably improves unresolved image-derivable fields.
- [ ] Return a final canonical listing plus merged internal verification metadata.
- [ ] Run the focused test file and confirm fallback tests pass.

## Task 4: Log pass-1 success vs fallback metrics

**Files:**
- Modify: `apps/server/lib/ai.ts`
- Test: `cd apps/server && npm test`

- [ ] Add structured logs for:
  - `ai.pass1.completed`
  - `ai.pass1.accepted`
  - `ai.pass1.requires_vision`
  - `ai.pass2.completed`
- [ ] Include unresolved field categories and resolved field categories in log payloads.
- [ ] Run full server tests.

## Task 5: Surface a simple UI verification state

**Files:**
- Modify: `apps/mobile/lib/types.ts`
- Modify: `apps/mobile/app/listing/[id].tsx`
- Test: `cd apps/mobile && npx tsc --noEmit`

- [ ] Add typed listing AI metadata for internal verification state.
- [ ] Show a simple `Requires verification` UI state only, without exposing raw internal categories.
- [ ] Keep field editing behavior unchanged; unresolved fields remain user-editable.
- [ ] Run mobile typecheck.

## Task 6: Final verification

**Files:**
- Modify: only if needed from prior tasks
- Test:
  - `cd apps/server && npx vitest run lib/__tests__/ai.test.ts`
  - `cd apps/server && npm test`
  - `npx tsc --noEmit -p apps/server/tsconfig.json`
  - `cd apps/mobile && npx tsc --noEmit`

- [ ] Run the focused AI test file.
- [ ] Run the full server suite.
- [ ] Run server typecheck.
- [ ] Run mobile typecheck.

---

## Self-review

- This plan covers: honest unknowns, text-first pass, deterministic fallback trigger, internal verification metadata, UI simplification, and fallback metrics.
- No placeholder tasks remain.
- Naming is kept aligned around `verificationStatus`, `unresolvedFields`, `lowConfidenceFields`, and `fallbackTriggered`.
