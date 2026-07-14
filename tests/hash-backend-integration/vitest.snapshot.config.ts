/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

import { sharedTestConfig } from "./vitest.config";

/**
 * Snapshot group: test files under `src/tests/subgraph/` wipe the graph and
 * restore standalone snapshots, so `test:integration` runs this config as a
 * separate vitest invocation after the seeded group (`vitest.config.ts`).
 * The `HASH_TEST_GROUP` marker lets `admin-server.ts` refuse destructive
 * operations outside this group.
 */
export default defineConfig({
  plugins: [],
  build: {
    target: "esnext",
  },
  test: {
    ...sharedTestConfig,
    coverage: {
      ...sharedTestConfig.coverage,
      // Sharing `./coverage` would discard the seeded group's report –
      // vitest cleans the reports directory at the start of a run.
      reportsDirectory: "./coverage-snapshot",
    },
    include: ["src/tests/subgraph/**/*.test.ts"],
    env: {
      HASH_TEST_GROUP: "snapshot",
    },
  },
});
