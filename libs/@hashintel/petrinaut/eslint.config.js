import storybook from "eslint-plugin-storybook";
import { createBase } from "@local/eslint/deprecated";

export default [
  ...createBase(import.meta.dirname),
  ...storybook.configs["flat/recommended"],
  {
    files: ["dev/**/*"],
    languageOptions: {
      parserOptions: {
        project: "./dev/tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["dev/*.tsx"],
    rules: {
      "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
    },
  },
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@mui/material/*"],
              message: "Please import from @mui/material instead",
            },
            {
              group: ["@local/*"],
              message:
                "You cannot use unpublished local packages in a published package.",
            },
          ],
        },
      ],
    },
  },
];
