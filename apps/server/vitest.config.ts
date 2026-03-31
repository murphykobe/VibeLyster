import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    // MOCK_MODE must be set before any module is loaded so db.ts captures it at module-eval time
    env: { MOCK_MODE: "1" },
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    exclude: ["**/*.integration.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
