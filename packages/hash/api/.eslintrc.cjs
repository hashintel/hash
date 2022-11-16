/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  rules: {
    // @todo Re-enable these rules once ESLint config is refactored
    "@typescript-eslint/restrict-plus-operands": "off",
    "@typescript-eslint/prefer-nullish-coalescing": "off",
    ...require("@local/eslint-config/temporarily-disable-rules.cjs")([
      /* 2022-11-15:  24 */ "@typescript-eslint/no-unsafe-argument",
      /* 2022-11-15:  74 */ "@typescript-eslint/no-unsafe-assignment",
      /* 2022-11-15:  59 */ "@typescript-eslint/no-unsafe-member-access",
      /* 2022-11-15:  35 */ "@typescript-eslint/no-unsafe-return",
      /* 2022-11-15:  11 */ "@typescript-eslint/require-await",
      /* 2022-11-15:  59 */ "@typescript-eslint/restrict-template-expressions",
    ]),
  },
  ignorePatterns: [
    ...require("@local/eslint-config/generate-ignore-patterns.cjs")(__dirname),
    "src/collab/**/*",
  ],
};
