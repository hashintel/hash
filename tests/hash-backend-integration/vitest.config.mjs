/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [],
  build: {
    target: "esnext",
  },
  test: {
    coverage: {
      enabled: process.env.TEST_COVERAGE === "true",
      provider: "istanbul",
      reporter: ["lcov", "text"],
      include: ["**/*.{c,m,}{j,t}s{x,}"],
      exclude: ["**/node_modules/**", "**/dist/**"],
    },
    setupFiles: ["@local/hash-backend-utils/environment"],
    include: [
      "src/tests/graph/**/*.test.ts",
      "src/tests/subgraph/**/*.test.ts",
    ],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 60_000,
    sequence: {
      hooks: "list",
    },
    poolOptions: {
      threads: {
        singleThread: true,
      },
      forks: {
        singleFork: true,
      },
    },
    maxConcurrency: 1,
  },
});
