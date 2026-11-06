import { defineConfig } from "@local/oxlint";

import tsdoc from "./tsdoc.json" with { type: "json" };

import type { OxlintConfig } from "oxlint";

const config: OxlintConfig = defineConfig({
  frameworks: ["effect", "vitest"],
  runtime: "browser",
  rules: {
    "effecttsgo/unstable-api-usage": "allow", // we make deliberate use of unstable APIs, to avoid external dependencies
    "jsdoc/require-throws-type": "allow", // TSDoc has no braces after `@throws`, so the thrown type opens the tag's text
    "jsdoc/check-tag-names": [
      "deny", // the tags `tsdoc.json` defines, such as `@category`, are the package's own
      {
        definedTags: tsdoc.tagDefinitions.map(({ tagName }) =>
          tagName.slice(1),
        ),
      },
    ],
  },
  overrides: [
    {
      files: [
        "src/Program/Expression*.ts",
        "tests/package.integration.test.ts",
      ],
      rules: {
        "unicorn/no-thenable": "allow", // HashQL branch records and user fields use then as data, not a Promise continuation.
      },
    },
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
