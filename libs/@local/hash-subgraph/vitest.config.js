/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "istanbul",
      enabled: process.env.TEST_COVERAGE === "true",
      include: ["**/*.{c,m,}{j,t}s{x,}", "!**/node_modules/**", "!**/dist/**"],
    },
    include: ["tests/**/*.test.ts"],
    // recreating DB takes longer than the default 5 seconds.
    // The chosen default give a lot of room to the integration test.
    testTimeout: 60_000,
  },
});
