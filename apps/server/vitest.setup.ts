import { beforeEach } from "vitest";

// Reset the in-memory mock DB before each test for full isolation
beforeEach(() => {
  (globalThis as unknown as Record<string, unknown>).__VIBELYSTER_MOCK_DB__ = undefined;
});
