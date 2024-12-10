import { createBase, disableRules } from "@local/eslint/deprecated";

export default [
  ...createBase(import.meta.dirname),
  ...disableRules([
    /* 2022-11-29:   6 */ "@typescript-eslint/no-unsafe-argument",
    /* 2022-11-29:  15 */ "@typescript-eslint/no-unsafe-assignment",
    /* 2022-11-29:   5 */ "@typescript-eslint/no-unsafe-call",
    /* 2022-11-29:   7 */ "@typescript-eslint/no-unsafe-member-access",
    /* 2022-11-29:   7 */ "@typescript-eslint/no-unsafe-return",
  ]),
  {
    rules: {
      "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
    },
  },
];
