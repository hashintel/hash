import { createBase, disableRules } from "@local/eslint/deprecated";

export default [
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
  },
];
