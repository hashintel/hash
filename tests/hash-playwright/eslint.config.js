import { createBase } from "@local/eslint/deprecated";

export default [
  ...createBase(import.meta.dirname),
  {
    files: ["**/*.{spec,test}.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@playwright/test",
              message: "Please import from ./shared/runtime instead",
            },
          ],
        },
      ],
    },
  },
];
