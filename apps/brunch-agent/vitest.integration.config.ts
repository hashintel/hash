import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/integration/**/*.test.ts"],
    // These tests spawn a child process that imports the built application and
    // opens a SQLite database, and one of them boots that child twice, so they
    // run for seconds where a unit test runs for milliseconds. The values match
    // `tests/hash-backend-integration`.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
