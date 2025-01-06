import { create } from "@local/eslint";

/**
 * @todo why is this required in this package but not others with the same config? if not explicitly typed, we get:
 *   TS2742: The inferred type of 'default' cannot be named without a reference to '../../../../../node_modules/@local/eslint/dist/utils.js'.
 *   This is likely not portable. A type annotation is necessary.
 *
 * @type {import('eslint').Linter.Config[]}
 */
const config = [
  ...create(import.meta.dirname, {
    enabled: {
      frontend: false,
      playwright: false,
      tests: true,
      storybook: false,
    },
  }),
  {
    rules: {
      "fsecond/prefer-destructured-optionals": "off",
    },
  },
];

export default config;
