import { createBase, disableRules } from "@local/eslint/deprecated";

export default [
  ...createBase(import.meta.dirname),
  ...disableRules([
    /* 2022-11-29:  25 */ "@typescript-eslint/no-unsafe-assignment",
    /* 2022-11-29:  32 */ "@typescript-eslint/no-unsafe-member-access",
  ]),
];
