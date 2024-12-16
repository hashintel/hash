import { create } from "@local/eslint";

export default [
  ...create(import.meta.dirname, {
    enabled: {
      frontend: false,
      playwright: false,
      tests: true,
      storybook: false,
    },
  }),
  // {
  //   rules: {
  //     "@typescript-eslint/no-redeclare": "off",
  //     "unicorn/filename-case": "off",
  //     "func-names": "off",
  //     "canonical/filename-no-index": "off",
  //     "@typescript-eslint/no-empty-object-type": [
  //       "error",
  //       { allowInterfaces: "with-single-extends" },
  //     ],
  //   },
  // },
];
