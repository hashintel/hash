import { createConfig, defineConfig } from "@local/oxlint";

import type { OxlintConfig } from "oxlint";

const config: OxlintConfig = defineConfig({
  extends: [
    createConfig({
      frameworks: ["effect", "vitest"],
      runtime: "node",
    }),
  ],
  overrides: [
    {
      files: ["src/**/*.ts"],
      rules: {
        "unicorn/filename-case": [
          "deny", // Module files follow Effect naming conventions.
          { cases: { pascalCase: true, kebabCase: true } },
        ],
      },
    },
  ],
});

export default config;
