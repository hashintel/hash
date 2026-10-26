import { defineConfig } from "vitest/config";

import type { ViteUserConfig } from "vitest/config";

const config: ViteUserConfig = defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          typecheck: { enabled: true },
        },
      },
    ],
  },
});

export default config;
