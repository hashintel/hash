/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import { BaseSequencer } from "vitest/node";

import type { TestSpecification } from "vitest/node";

/**
 * The subgraph tests reset the graph and restore standalone snapshots,
 * destroying the shared system graph seeded once per run by `globalSetup`.
 * Sort them after all other test files so that they cannot break tests which
 * rely on the shared seed – the next run's `globalSetup` re-seeds the graph
 * from scratch.
 */
class DestructiveTestsLastSequencer extends BaseSequencer {
  override async sort(files: TestSpecification[]) {
    const isDestructive = (file: TestSpecification) =>
      file.moduleId.includes("/src/tests/subgraph/");

    const sorted = await super.sort(files);

    return [
      ...sorted.filter((file) => !isDestructive(file)),
      ...sorted.filter(isDestructive),
    ];
  }
}

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
    globalSetup: ["./src/tests/global-setup.ts"],
    setupFiles: [
      "@local/hash-backend-utils/environment",
      "./src/tests/setup-opentelemetry.ts",
    ],
    include: [
      "src/tests/graph/**/*.test.ts",
      "src/tests/subgraph/**/*.test.ts",
    ],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 120_000,
    sequence: {
      hooks: "list",
      sequencer: DestructiveTestsLastSequencer,
    },
    /**
     * These integration tests share a single graph instance, so running files
     * in parallel causes graph state races.
     */
    fileParallelism: false,
    maxWorkers: 1,
    maxConcurrency: 1,
  },
});
