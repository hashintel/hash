import { defineConfig } from "@local/oxlint";

import type { OxlintConfig } from "oxlint";

const config: OxlintConfig = defineConfig({
  frameworks: ["react", "next", "effect", "vitest"],
  runtime: "browser",
  rules: {
    "effecttsgo/unstable-api-usage": "allow", // `FileSystem`, `Path` and the Node layer that provides them are unstable in Effect 4.
    "no-continue": "allow", // A blank ban on them does not make sense
  },
  overrides: [
    {
      files: ["src/AST/index.ts"],
      rules: {
        "jsdoc/check-tag-names": [
          "deny", // Effect recognises this annotation for caller-supplied graph stores.
          { definedTags: ["effect-leakable-service"] },
        ],
      },
    },
    {
      files: ["src/internal/ast-types.ts", "src/internal/ast-exposure.ts"],
      rules: {
        "max-classes-per-file": [
          "deny", // Keep each public service key and its private state key together.
          2,
        ],
      },
    },
    {
      files: ["preview/mdx-types.d.ts"],
      rules: {
        "import/unambiguous": "allow", // An ambient module declaration exists only in a script.
      },
    },
    {
      files: ["preview/**/*.tsx"],
      rules: {
        "effecttsgo/async-function": "allow", // Next renders server components and generates metadata through async functions.
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
    {
      files: ["src/TypeScript/**/*.ts", "tests/**/*.ts"],
      rules: {
        "typescript/promise-function-async": "allow", // `effecttsgo/async-function` forbids `async`, and `Effect.tryPromise` catches a synchronous throw from its callback.
      },
    },
  ],
});

export default config;
