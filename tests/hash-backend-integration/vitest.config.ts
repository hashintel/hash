/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

import type { TestUserConfig } from "vitest/config";

/**
 * Test options shared between the seeded group (this config) and the snapshot
 * group (`vitest.snapshot.config.ts`), which `test:integration` runs as
 * separate, sequential vitest invocations.
 */
export const sharedTestConfig = {
  coverage: {
    enabled: process.env.TEST_COVERAGE === "true",
    provider: "istanbul",
    reporter: ["lcov", "text"],
    include: ["**/*.{c,m,}{j,t}s{x,}"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
  setupFiles: [
    "@local/hash-backend-utils/environment",
    "./src/tests/setup-opentelemetry.ts",
  ],
  environment: "node",
  testTimeout: 60_000,
  hookTimeout: 120_000,
  sequence: {
    hooks: "list",
  },
  /**
   * These integration tests share a single graph instance, so running files
   * in parallel causes graph state races.
   */
  fileParallelism: false,
  maxWorkers: 1,
  maxConcurrency: 1,
} satisfies TestUserConfig;

export default defineConfig({
  plugins: [],
  build: {
    target: "esnext",
  },
  test: {
    ...sharedTestConfig,
    globalSetup: ["./src/tests/global-setup.ts"],
    include: ["src/tests/graph/**/*.test.ts"],
  },
});
