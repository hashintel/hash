import { defineConfig } from "@local/oxlint";

import type { OxlintConfig } from "oxlint";

const config: OxlintConfig = defineConfig({
  frameworks: ["react", "next"],
  runtime: "browser",
  overrides: [
    {
      files: ["preview/mdx-types.d.ts"],
      rules: {
        "import/unambiguous": "allow", // An ambient module declaration exists only in a script.
      },
    },
  ],
});

export default config;
