import { createBase } from "@local/eslint/deprecated";

export default [
  ...createBase(import.meta.dirname),
  {
    rules: {
      "no-console": "off",
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
];
