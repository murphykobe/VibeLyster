import { defineConfig } from "vitest/config";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";

// Load .env.local so DATABASE_URL is available for Neon
if (fs.existsSync(".env.local")) {
  dotenv.config({ path: ".env.local" });
}

export default defineConfig({
  test: {
    // No MOCK_MODE — uses real Neon DB
    env: { MOCK_MODE: "0" },
    environment: "node",
    include: ["lib/__tests__/db.integration.test.ts"],
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
