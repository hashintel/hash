import { createBase } from "@local/eslint/deprecated";

/**
 * @todo why is this required in this package but not others with the same config? if not explicitly typed, we get:
 *   TS2742: The inferred type of 'default' cannot be named without a reference to '../../../../../node_modules/@local/eslint/dist/utils.js'.
 *   This is likely not portable. A type annotation is necessary.
 *
 * @type {import('eslint').Linter.Config[]}
 */
const config = [
  ...createBase(import.meta.dirname),
  {
    rules: {
      "@typescript-eslint/no-redeclare": "off",
      "unicorn/filename-case": "off",
      "func-names": "off",
      "canonical/filename-no-index": "off",
      "@typescript-eslint/no-empty-object-type": [
        "error",
        { allowInterfaces: "with-single-extends" },
      ],
    },
  },
];

export default config;
