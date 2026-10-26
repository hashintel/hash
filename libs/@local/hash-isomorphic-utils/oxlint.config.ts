import { defineConfig } from "@local/oxlint";

import type { OxlintConfig } from "oxlint";

const config: OxlintConfig = defineConfig({
  runtime: "browser",
  frameworks: ["vitest"],
  ignorePatterns: [
    "**/*.gen.*",
    "src/ontology-type-ids.ts",
    "src/system-types/**",
  ],
  overrides: [
    {
      files: ["src/generate-system-types.ts", "src/**/*.test.ts"],
      env: { browser: false, node: true },
    },
  ],
});

export default config;
