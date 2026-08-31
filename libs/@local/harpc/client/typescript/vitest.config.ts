/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [],
  build: {
    target: "esnext",
  },
  test: {
    // eslint-disable-next-line unicorn/prevent-abbreviations -- Vitest configuration property
    dir: "tests",
    coverage: {
      enabled: process.env.TEST_COVERAGE === "true",
      provider: "istanbul",
      reporter: ["lcov", "text"],
      include: ["**/*.{c,m,}{j,t}s{x,}"],
    },
    environment: "node",
    testTimeout: 30000,
    maxConcurrency: 16,
  },
});
