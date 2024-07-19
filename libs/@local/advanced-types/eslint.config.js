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
  { "import/no-extraneous-dependencies": ["error", { devDependencies: true }] },
]);
