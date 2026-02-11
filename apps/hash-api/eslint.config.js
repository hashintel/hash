import {
  createBase,
  defineConfig,
  disableRules,
} from "@local/eslint/deprecated";

export default defineConfig([
  {
    // Static browser assets are not part of the TypeScript project
    ignores: ["public/**"],
  },
  ...createBase(import.meta.dirname),
  {
    rules: {
      "@typescript-eslint/restrict-plus-operands": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
    },
  },
  ...disableRules([
    /* 2022-11-29:  11 */ "@typescript-eslint/no-unsafe-argument",
    /* 2022-11-29:  69 */ "@typescript-eslint/no-unsafe-assignment",
    /* 2022-11-29:  37 */ "@typescript-eslint/no-unsafe-call",
    /* 2022-11-29:  73 */ "@typescript-eslint/no-unsafe-member-access",
    /* 2022-11-29:  45 */ "@typescript-eslint/no-unsafe-return",
    /* 2022-11-29:  13 */ "@typescript-eslint/require-await",
    /* 2022-11-29:  35 */ "@typescript-eslint/restrict-template-expressions",
    "canonical/filename-no-index",
  ]),
]);
