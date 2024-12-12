import storybook from "eslint-plugin-storybook";
import { createBase, disableRules } from "@local/eslint/deprecated";

export default [
  ...createBase(import.meta.dirname),
  ...storybook.configs["flat/recommended"],
  ...disableRules([
    /* 2022-11-29:  14 */ "@typescript-eslint/no-unsafe-assignment",
  ]),
  {
    rules: {
      "jsx-a11y/label-has-associated-control": "off",
      "import/no-default-export": "error",
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["components", "!./theme/components", "!components/"],
              message:
                "Please import from the component's file directly, not components.ts",
            },
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
      "storybook/no-uninstalled-addons": [
        "error",
        { packageJsonLocation: `${import.meta.dirname}/package.json` },
      ],
    },
  },
  {
    files: ["**/*.stories.{j,t}s{x,}"],
    rules: {
      "import/no-default-export": "off",
    },
  },
];
