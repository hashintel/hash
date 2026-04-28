import typescriptEslint from "@typescript-eslint/eslint-plugin";

import { createBase, disableRules } from "@local/eslint/deprecated";

const disableTypeCheckedRules =
  typescriptEslint.configs["disable-type-checked"]?.rules ?? {};

export default [
  {
    ignores: [
      ".build/**",
      ".ladle/**",
      "tests/**",
      "playwright.config.ts",
      "postcss.config.cjs",
      "panda.local.config.ts",
      "src/stories/Intro.mdx",
    ],
  },
  ...createBase(import.meta.dirname),
  ...disableRules([]),
  {
    rules: {
      "import/no-default-export": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@local/*"],
              message:
                "You cannot use unpublished local packages in a published package.",
            },
          ],
        },
      ],
    },
    files: ["src/**/*.ts{x,}"],
  },
  {
    files: ["src/**/*.stories.ts{x,}"],
    rules: {
      "import/no-default-export": "off",
      "react/destructuring-assignment": "off",
    },
  },
  {
    // Story files are intentionally excluded from `tsconfig.json` (they live
    // in `tsconfig.beta.json`). Running type-aware lint rules on them forces
    // ESLint's project service into a slow default-project fallback per file
    // *and* type-instantiates the very heavy generated `styled-system` types
    // for every single story. Disable type-aware linting entirely for the
    // story surface — they're demo code, not shipped to consumers.
    files: [
      "src/**/*.story.ts{x,}",
      "src/**/*.stories.ts{x,}",
      "src/tokens/**/*.{ts,tsx,mdx}",
    ],
    languageOptions: {
      parserOptions: {
        // Drop the type-aware project lookup for story files. Without this,
        // every story still costs a full project-service resolve even when
        // every type-aware rule is off.
        projectService: false,
        project: false,
      },
    },
    rules: {
      ...disableTypeCheckedRules,
      "@typescript-eslint/no-shadow": "off",
      "id-length": "off",
      "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
      "react/no-array-index-key": "off",
    },
  },
  {
    files: ["scripts/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unnecessary-type-assertion": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      curly: "off",
      "dot-notation": "off",
      "id-length": "off",
      "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
      "simple-import-sort/imports": "off",
      "unicorn/import-style": "off",
      "unicorn/no-array-for-each": "off",
    },
  },
  {
    files: ["src/preset.ts"],
    rules: {
      "import/no-default-export": "off",
    },
  },
];
