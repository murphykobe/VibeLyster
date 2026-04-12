# Grailed Remote Linkage and Offers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reuse linked Grailed drafts across retries and saves, and add an accept-offers toggle that defaults to false.

**Architecture:** Preserve Grailed remote draft IDs even on live submit failures, reuse them on retry, and trigger asynchronous Grailed draft syncs after local saves when the remote state is draft. Store accept-offers as a canonical trait and map it to Grailed offer flags.

**Tech Stack:** Next.js route handlers, TypeScript, Vitest, Expo React Native

---

### Task 1: Add failing Grailed retry/linkage tests
- [ ] Write failing Grailed tests for preserving a draft ID on submit failure and reusing it on later updates.
- [ ] Run focused Grailed tests and verify failure.
- [ ] Implement minimal Grailed publish result changes.
- [ ] Re-run focused tests and verify pass.

### Task 2: Trigger asynchronous Grailed draft sync on local save
- [ ] Add failing route test or helper-level test coverage for save-triggered Grailed draft sync conditions.
- [ ] Implement background Grailed draft sync for linked remote drafts only.
- [ ] Verify save route and Grailed tests pass.

### Task 3: Add accept-offers canonical trait + UI toggle
- [ ] Add failing tests for default-false Grailed payload mapping and explicit true mapping.
- [ ] Update AI prompt/normalization so offers are only enabled when explicit.
- [ ] Add listing edit toggle and API type support using `traits.accept_offers`.
- [ ] Run server tests and mobile typecheck.
