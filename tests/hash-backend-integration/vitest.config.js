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
    include: [
      "src/tests/graph/**/*.test.ts",
      "src/tests/subgraph/**/*.test.ts",
    ],
    setupFiles: ["src/tests/load-test-env.ts"],
    testTimeout: 60_000,
    poolOptions: {
      threads: {
        singleThread: true,
      },
      forks: {
        singleFork: true,
      },
    },
  },
});
