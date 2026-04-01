import { defineConfig, devices } from "@playwright/test";

/**
 * VibeLyster E2E tests.
 *
 * Modes:
 *   1. Mock/local (default)
 *      - starts the mock Next.js backend + Expo Web automatically
 *      - no Clerk auth, no external APIs
 *   2. Live/preview
 *      - set E2E_BASE_URL to run against a deployed app
 *      - optionally set E2E_API_URL if the API origin differs from the web origin
 *      - requires E2E_EMAIL / E2E_PASSWORD for the auth setup project
 *
 * Examples:
 *   cd apps/e2e && npm test
 *   cd apps/e2e && E2E_BASE_URL=https://mobile-one-theta.vercel.app npm run test:preview
 */
const BACKEND_URL = process.env.E2E_API_URL || "http://localhost:3001";
const WEB_URL = process.env.E2E_BASE_URL || "http://localhost:8081";
const LIVE_MODE = Boolean(process.env.E2E_BASE_URL);
const MANUAL_AI_MODE = ["1", "true", "yes", "on"].includes((process.env.E2E_MANUAL_AI ?? "").toLowerCase());
const AUTH_FILE = "./playwright/.auth/user.json";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: LIVE_MODE ? 60_000 : 30_000,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: WEB_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    extraHTTPHeaders: LIVE_MODE ? undefined : { "x-mock-user-id": "e2e-user" },
  },

  projects: LIVE_MODE
    ? [
        {
          name: "setup",
          testMatch: /auth\.setup\.ts/,
          use: { ...devices["Desktop Chrome"] },
        },
        {
          name: "chromium",
          testMatch: MANUAL_AI_MODE ? [/.*\.live\.spec\.ts/, /.*\.manual\.spec\.ts/] : /.*\.live\.spec\.ts/,
          testIgnore: MANUAL_AI_MODE ? undefined : ["**/*.manual.spec.ts"],
          dependencies: ["setup"],
          use: { ...devices["Desktop Chrome"], storageState: AUTH_FILE },
        },
      ]
    : [
        {
          name: "chromium",
          testIgnore: ["**/*.live.spec.ts", "**/*.manual.spec.ts", "**/*.setup.ts"],
          use: { ...devices["Desktop Chrome"] },
        },
      ],

  webServer: LIVE_MODE
    ? undefined
    : [
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
                "npx serve dist/web --single --listen 8081",
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
          timeout: 120_000,
        },
      ],
});
