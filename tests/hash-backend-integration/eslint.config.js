import { createBase, disableRules } from "@local/eslint/deprecated";

export default [
  ...createBase(import.meta.dirname),
  ...disableRules([
    /* 2022-11-29:  82 */ "@typescript-eslint/no-unsafe-assignment",
    /* 2022-11-29:  28 */ "@typescript-eslint/no-unsafe-call",
    /* 2022-11-29:  81 */ "@typescript-eslint/no-unsafe-member-access",
  ]),
];
