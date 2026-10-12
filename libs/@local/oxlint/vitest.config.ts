import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Oxlint's RuleTester registers its cases through the test framework's globals.
    globals: true,
    include: ["src/**/*.test.ts"],
  },
});
