# Grailed Size Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve canonical structured size through publish and map it to Grailed-valid payload sizes before any Grailed API call.

**Architecture:** Extend the canonical publish input with structured size context, then add a Grailed-local size mapper/validator that converts supported canonical sizes into Grailed payload values and produces clear non-retryable errors for unsupported combinations. Keep remote 422 handling as defense in depth.

**Tech Stack:** Next.js route handlers, TypeScript, Vitest

---

### Task 1: Add failing Grailed size-mapping tests

**Files:**
- Modify: `apps/server/lib/marketplace/__tests__/grailed.test.ts`
- Test: `apps/server/lib/marketplace/__tests__/grailed.test.ts`

- [ ] **Step 1: Write the failing tests**
- [ ] **Step 2: Run `npm test -w apps/server -- grailed.test.ts` to verify they fail for the expected reasons**
- [ ] **Step 3: Implement the minimal Grailed size-mapping code**
- [ ] **Step 4: Run `npm test -w apps/server -- grailed.test.ts` to verify the tests pass**

### Task 2: Preserve structured size through publish

**Files:**
- Modify: `apps/server/lib/marketplace/types.ts`
- Modify: `apps/server/app/api/publish/route.ts`
- Modify: `apps/server/app/api/publish/bulk/route.ts`
- Test: `apps/server/lib/marketplace/__tests__/grailed.test.ts`

- [ ] **Step 1: Extend canonical publish input with optional structured size context**
- [ ] **Step 2: Populate structured size in single and bulk publish routes**
- [ ] **Step 3: Re-run focused Grailed tests**

### Task 3: Verify no Grailed regression in supported field mapping

**Files:**
- Modify: `apps/server/lib/marketplace/grailed.ts`
- Test: `apps/server/lib/marketplace/__tests__/grailed.test.ts`

- [ ] **Step 1: Confirm draft payload still maps category, condition, designers, traits, photos, shipping, and remote-state fields**
- [ ] **Step 2: Run `npm test -w apps/server -- grailed.test.ts`**
- [ ] **Step 3: Run `npm test -w apps/server` for broader verification if focused tests pass**
