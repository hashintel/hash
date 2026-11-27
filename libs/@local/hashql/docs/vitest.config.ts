import { configDefaults, defineConfig } from "vitest/config";

import type { ViteUserConfig } from "vitest/config";

const integration = "**/*.integration.test.ts";

const config: ViteUserConfig = defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
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

export default config;
