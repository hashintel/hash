import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
    // These tests open Postgres schemas on the compose server and run whole
    // turns, so they run for seconds where a unit test runs for milliseconds.
    // The values match `apps/brunch-agent` and `tests/hash-backend-integration`.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
