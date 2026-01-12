// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import { createBase, disableRules } from "@local/eslint/deprecated";

export default [
  ...createBase(import.meta.dirname),
  ...storybook.configs["flat/recommended"],
  ...disableRules([]),
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "vite.config.ts",
            "panda.config.ts",
            "postcss.config.cjs",
            "styled-system/css/*",
            ".storybook/*.ts",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      "import/no-default-export": "error",
      "import/no-unresolved": [
        "error",
        {
          ignore: ["^(\\.\\./)+styled-system/"],
        },
      ],
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
    },
  },
  {
    files: ["src/**/*.figma.ts{x,}"],
    rules: {
      "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
    },
  },
];
