import assert from "node:assert/strict";
import test from "node:test";
import { DepopApiError, classifyError } from "./depop-api.js";

// Mirrors grailed-api.test.js. classifyError is the single source of
// truth for depop-cli's exit-code contract.

test("classifyError: a real 401 from Depop's backend is TOKEN_EXPIRED", () => {
  const err = new DepopApiError("Depop API error 401: {...}", {
    status: 401,
    cloudflareBlock: false,
    body: { error: { message: "You must be logged in" } },
  });
  assert.deepEqual(classifyError(err), { exitCode: 3, key: "TOKEN_EXPIRED" });
});

test("classifyError: the branded Cloudflare/Depop 403 block page is CLOUDFLARE_BLOCK", () => {
  // Matches the real 2026-09-13 finding on /presentation/api/v1/pictures/:
  // a non-JSON, Depop-branded "Forbidden" HTML page, status 403, answered
  // before ever reaching Depop's backend.
  const err = new DepopApiError("Depop API error 403: ...", {
    status: 403,
    cloudflareBlock: true,
    body: "<!doctype html><title>Forbidden - Depop</title>...",
  });
  assert.deepEqual(classifyError(err), { exitCode: 4, key: "CLOUDFLARE_BLOCK" });
});

test("classifyError: an ordinary application error is exit 1 with its status", () => {
  const err = new DepopApiError("Depop API error 422: {...}", {
    status: 422,
    cloudflareBlock: false,
    body: { error: { message: "Invalid category" } },
  });
  assert.deepEqual(classifyError(err), { exitCode: 1, key: "API_ERROR", status: 422 });
});

test("classifyError: a non-DepopApiError (e.g. a file read failure) is a plain exit 1", () => {
  const err = new Error("ENOENT: no such file or directory");
  assert.deepEqual(classifyError(err), { exitCode: 1, key: "ERROR" });
});

test("DepopApiError preserves .message unchanged for anything reading only that", () => {
  const err = new DepopApiError("Depop API error 401: {\"foo\":1}", { status: 401 });
  assert.equal(err.message, "Depop API error 401: {\"foo\":1}");
  assert.equal(err.name, "DepopApiError");
});
