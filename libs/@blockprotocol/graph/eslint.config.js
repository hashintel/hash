import { createBase } from "@local/eslint/deprecated";

export default [
  ...createBase(import.meta.dirname),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
