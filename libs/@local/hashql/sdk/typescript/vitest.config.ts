import { configDefaults, defineConfig } from "vitest/config";

import type { ViteUserConfig } from "vitest/config";

const integration = "**/*.integration.test.{ts,tsx}";

const config: ViteUserConfig = defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          exclude: [...configDefaults.exclude, integration],
          typecheck: { enabled: true },
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: [integration],
          typecheck: { enabled: true, include: [integration] },
        },
      },
    ],
  },
});

export default config;
