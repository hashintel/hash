import { createBase } from "@local/eslint/deprecated";

export default [
  ...createBase(import.meta.dirname),
  {
    rules: {
      "global-require": "off",
    },
  },
];
