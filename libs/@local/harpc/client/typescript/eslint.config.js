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
  {
    rules: {
      "fsecond/prefer-destructured-optionals": "off",
    },
  },
];
