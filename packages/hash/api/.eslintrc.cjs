/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  rules: {
    // @todo Re-enable these rules once ESLint config is refactored
    "@typescript-eslint/restrict-plus-operands": "off",
    "@typescript-eslint/prefer-nullish-coalescing": "off",
    ...require("@local/eslint-config/temporarily-disable-rules.cjs")([
      /* 2022-11-16:  25 */ "@typescript-eslint/no-unsafe-argument",
      /* 2022-11-16:  72 */ "@typescript-eslint/no-unsafe-assignment",
      /* 2022-11-16:  37 */ "@typescript-eslint/no-unsafe-call",
      /* 2022-11-16:  58 */ "@typescript-eslint/no-unsafe-member-access",
      /* 2022-11-16:  33 */ "@typescript-eslint/no-unsafe-return",
      /* 2022-11-16:  11 */ "@typescript-eslint/require-await",
      /* 2022-11-16:  59 */ "@typescript-eslint/restrict-template-expressions",
    ]),
  },
  ignorePatterns: [
    ...require("@local/eslint-config/generate-ignore-patterns.cjs")(__dirname),
    "src/collab/**/*",
  ],
};
