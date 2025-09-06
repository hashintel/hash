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
