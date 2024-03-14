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
  },
});
