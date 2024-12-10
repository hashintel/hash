import { createBase, disableRules } from "@local/eslint/deprecated";

export default [
  ...createBase(import.meta.dirname),
  ...disableRules([
    /* 2022-11-29:  15 */ "@typescript-eslint/no-unsafe-member-access",
    /* 2022-11-29:  11 */ "@typescript-eslint/unbound-method",
  ]),
];
