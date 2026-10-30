import { configDefaults, defineConfig } from "vitest/config";

const integration = "**/*.integration.test.{ts,tsx}";

export default defineConfig({
  test: {
    // Oxlint's RuleTester registers its cases through the test framework's globals.
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          exclude: [...configDefaults.exclude, integration],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: [integration],
        },
      },
    ],
  },
});
