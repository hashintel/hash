import { defineConfig } from "@local/oxlint";

import type { OxlintConfig } from "oxlint";

const config: OxlintConfig = defineConfig({
  frameworks: ["effect", "vitest"],
  runtime: "browser",
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
