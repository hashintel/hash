import { createBase } from "@local/eslint/deprecated";

export default [
  ...createBase(import.meta.dirname),
  {
    ignores: ["rollup.config.js"],
    rules: {
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
