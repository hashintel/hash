// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import { createBase, disableRules } from "@local/eslint/deprecated";

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
  ...storybook.configs["flat/recommended"],
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
    files: ["src/**/*.story.ts{x,}", "src/stories/**/*.{ts,tsx,mdx}"],
    rules: {
      "@typescript-eslint/no-unnecessary-condition": "off",
      "id-length": "off",
      "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
      "storybook/default-exports": "off",
      "storybook/no-redundant-story-name": "off",
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
