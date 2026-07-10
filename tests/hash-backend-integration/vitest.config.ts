/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

import type { TestUserConfig } from "vitest/config";

/**
 * The backend integration tests are split into two groups which run as
 * separate, sequential vitest invocations (see the `test:integration` script
 * in `package.json`):
 *
 * - the seeded group (this config, `src/tests/graph/`): runs against the
 *   shared system graph seeded once per run by `globalSetup` and must never
 *   wipe it, and
 * - the snapshot group (`vitest.snapshot.config.ts`, `src/tests/subgraph/`):
 *   wipes the graph and restores standalone snapshots, so it runs after the
 *   seeded group.
 *
 * These test options are shared between the two configs.
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
