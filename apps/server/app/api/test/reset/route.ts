import { isMockMode } from "@/lib/mock";

/**
 * POST /api/test/reset
 * Clears the in-memory mock DB. Only available when MOCK_MODE=1.
 * Used by E2E tests to ensure a clean state before each test.
 */
export async function POST() {
  if (!isMockMode()) {
    return Response.json({ error: "Only available in mock mode" }, { status: 403 });
  }
  (globalThis as Record<string, unknown>).__VIBELYSTER_MOCK_DB__ = undefined;
  return Response.json({ ok: true });
}
