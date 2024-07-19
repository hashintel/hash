import { create, defineFlatConfig } from "@local/eslint";

export default defineFlatConfig([
  ...create({
    enabled: {
      frontend: false,
      playwright: false,
      tests: false,
      storybook: true,
    },
    noRestrictedImports: () => [
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
  }),
  {
    rules: {
      "jsx-a11y/label-has-associated-control": "off",
      "import/no-default-export": "error",
    },
  },
]);
