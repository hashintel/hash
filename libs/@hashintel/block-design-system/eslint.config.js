import { createBase, disableRules } from "@local/eslint/deprecated";

export default [
  ...createBase(import.meta.dirname),
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
              group: ["*/main"],
              message:
                "Please import from the component file directly, not main.ts",
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
    },
  },
  {
    files: ["**/*.stories.{j,t}s{x,}"],
    rules: {
      "import/no-default-export": "off",
    },
  },
];
