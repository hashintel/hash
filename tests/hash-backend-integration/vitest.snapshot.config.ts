/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

import { sharedTestConfig } from "./vitest.config";

/**
 * Config for the snapshot group of the backend integration tests: the test
 * files under `src/tests/subgraph/` wipe the graph via `resetGraph` and
 * restore standalone snapshots via `restoreSnapshot`, so they cannot share
 * the system graph seeded by the seeded group's `globalSetup`.
 *
 * The `test:integration` script in `package.json` runs this config as a
 * separate vitest invocation after the seeded group (`vitest.config.ts`), so
 * the seeded group structurally cannot lose its seed to these tests. There is
 * deliberately no `globalSetup` here – each test file restores the snapshot
 * it needs, and the next seeded run re-seeds the graph from scratch.
 *
 * To make a test file destructive, place it under `src/tests/subgraph/` so
 * this config picks it up. Destructive graph operations refuse to run outside
 * this group: `resetGraph`/`restoreSnapshot` in `src/tests/admin-server.ts`
 * throw unless the `HASH_TEST_GROUP` marker below is set.
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
      /**
       * Written next to the seeded group's `./coverage` – vitest cleans its
       * reports directory at the start of a run, so sharing one directory
       * would discard the seeded group's report.
       */
      reportsDirectory: "./coverage-snapshot",
    },
    include: ["src/tests/subgraph/**/*.test.ts"],
    env: {
      HASH_TEST_GROUP: "snapshot",
    },
  },
});
