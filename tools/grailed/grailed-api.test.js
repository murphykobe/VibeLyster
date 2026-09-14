import assert from "node:assert/strict";
import test from "node:test";
import { GrailedApiError, classifyError } from "./grailed-api.js";

// classifyError is the single source of truth for the CLI's exit-code
// contract (0 success / 1 error / 3 SESSION_EXPIRED / 4 CLOUDFLARE_BLOCK).
// These are pure, network-free tests against constructed errors — the
// real network behavior they encode was verified manually on 2026-09-13:
// a 401 with a JSON body reaches Grailed's real backend (SESSION_EXPIRED);
// a non-JSON (HTML) body means Cloudflare's edge answered instead
// (CLOUDFLARE_BLOCK), regardless of status code.

test("classifyError: a real 401 from Grailed's backend is SESSION_EXPIRED", () => {
  const err = new GrailedApiError("Grailed API error 401: {...}", {
    status: 401,
    cloudflareBlock: false,
    body: { error: { message: "You must be logged in" } },
  });
  assert.deepEqual(classifyError(err), { exitCode: 3, key: "SESSION_EXPIRED" });
});

test("classifyError: a real 403 from Grailed's backend is also SESSION_EXPIRED", () => {
  const err = new GrailedApiError("Grailed API error 403: {...}", {
    status: 403,
    cloudflareBlock: false,
    body: { error: { message: "Forbidden" } },
  });
  assert.deepEqual(classifyError(err), { exitCode: 3, key: "SESSION_EXPIRED" });
});

test("classifyError: an HTML block page is CLOUDFLARE_BLOCK even when status is 403", () => {
  // Matches the real 2026-09-13 finding: Cloudflare answers grailed.com's
  // own API path with a 403 whose body is an HTML "Attention Required!"
  // page, not JSON — same status code as a real auth failure, so the
  // body shape (not the status) is what has to disambiguate.
  const err = new GrailedApiError("Grailed API error 403: ...", {
    status: 403,
    cloudflareBlock: true,
    body: "<!doctype html><title>Attention Required! | Cloudflare</title>...",
  });
  assert.deepEqual(classifyError(err), { exitCode: 4, key: "CLOUDFLARE_BLOCK" });
});

test("classifyError: an ordinary application error (e.g. 422) is exit 1 with its status", () => {
  const err = new GrailedApiError("Grailed API error 422: {...}", {
    status: 422,
    cloudflareBlock: false,
    body: { error: { message: "Invalid category" } },
  });
  assert.deepEqual(classifyError(err), { exitCode: 1, key: "API_ERROR", status: 422 });
});

test("classifyError: a non-GrailedApiError (e.g. a file read failure) is a plain exit 1", () => {
  const err = new Error("ENOENT: no such file or directory");
  assert.deepEqual(classifyError(err), { exitCode: 1, key: "ERROR" });
});

test("GrailedApiError preserves .message unchanged for anything reading only that", () => {
  const err = new GrailedApiError("Grailed API error 401: {\"foo\":1}", { status: 401 });
  assert.equal(err.message, "Grailed API error 401: {\"foo\":1}");
  assert.equal(err.name, "GrailedApiError");
});
