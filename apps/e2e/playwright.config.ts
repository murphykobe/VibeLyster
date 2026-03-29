import { defineConfig, devices } from "@playwright/test";

/**
 * VibeLyster E2E tests.
 *
 * Both web servers start automatically before the suite runs:
 *   1. Next.js mock backend (port 3001) — MOCK_MODE=1, no Neon/Clerk/marketplace
 *   2. Expo Web (port 8081) — EXPO_PUBLIC_MOCK_MODE=1, no Clerk auth guard
 *
 * Run: cd apps/e2e && npm test
 */
const BACKEND_URL = "http://localhost:3001";
const WEB_URL = "http://localhost:8081";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,      // serial — shared in-memory mock DB per backend process
  workers: 1,
  retries: 1,
  timeout: 30_000,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: WEB_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // All tests talk to mock backend
    extraHTTPHeaders: { "x-mock-user-id": "e2e-user" },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: [
    {
      // Mock Next.js backend
      command: "MOCK_MODE=1 npm run dev",
      cwd: "../server",
      url: BACKEND_URL,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    },
    {
      // Expo Web:
      //   - Local dev: dev server (fast iteration)
      //   - CI: static export served with `serve` (deterministic, no interactive TTY needed)
      command: process.env.CI
        ? [
            "EXPO_PUBLIC_MOCK_MODE=1",
            `EXPO_PUBLIC_API_URL=${BACKEND_URL}`,
            "EXPO_PUBLIC_MOCK_USER_ID=e2e-user",
            "npx expo export --platform web --output-dir dist/web 2>&1 &&",
            "npx serve dist/web --listen 8081",
          ].join(" ")
        : [
            "EXPO_PUBLIC_MOCK_MODE=1",
            `EXPO_PUBLIC_API_URL=${BACKEND_URL}`,
            "EXPO_PUBLIC_MOCK_USER_ID=e2e-user",
            "npx expo start --web --port 8081",
          ].join(" "),
      cwd: "../mobile",
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,   // static build needs more time than a dev server start
    },
  ],
});
