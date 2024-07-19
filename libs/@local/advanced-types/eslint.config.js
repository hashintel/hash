import { create, defineFlatConfig } from "@local/eslint";

export default defineFlatConfig([
  ...create({
    enabled: {
      frontend: false,
      playwright: false,
      tests: false,
      storybook: false,
    },
  }),
  {
    rules: {
      "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
    },
  },
]);
