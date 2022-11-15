/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  rules: {
    // @todo Re-enable these rules once ESLint config is refactored
    "@typescript-eslint/restrict-plus-operands": "off",
    "@typescript-eslint/prefer-nullish-coalescing": "off",
    ...require("@local/eslint-config/temporarily-disable-rules.cjs")([
      /* 2022-11-11:  60 */ "@typescript-eslint/no-unsafe-argument",
      /* 2022-11-11: 110 */ "@typescript-eslint/no-unsafe-assignment",
      /* 2022-11-11:  26 */ "@typescript-eslint/no-unsafe-call",
      /* 2022-11-11: 103 */ "@typescript-eslint/no-unsafe-member-access",
      /* 2022-11-11:  40 */ "@typescript-eslint/no-unsafe-return",
      /* 2022-11-11:  11 */ "@typescript-eslint/require-await",
      /* 2022-11-11:  64 */ "@typescript-eslint/restrict-template-expressions",
      /* 2022-11-11:   7 */ "@typescript-eslint/unbound-method",
    ]),
  },
  ignorePatterns: [
    ...require("@local/eslint-config/generate-ignore-patterns.cjs")(__dirname),
    "src/collab/**/*",
  ],
};
