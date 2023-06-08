/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  rules: {
    // @todo Re-enable these rules once ESLint config is refactored
    "@typescript-eslint/restrict-plus-operands": "off",
    "@typescript-eslint/prefer-nullish-coalescing": "off",
    ...require("@local/eslint-config/temporarily-disable-rules.cjs")([
      /* 2022-11-29:  11 */ "@typescript-eslint/no-unsafe-argument",
      /* 2022-11-29:  69 */ "@typescript-eslint/no-unsafe-assignment",
      /* 2022-11-29:  37 */ "@typescript-eslint/no-unsafe-call",
      /* 2022-11-29:  73 */ "@typescript-eslint/no-unsafe-member-access",
      /* 2022-11-29:  45 */ "@typescript-eslint/no-unsafe-return",
      /* 2022-11-29:  13 */ "@typescript-eslint/require-await",
      /* 2022-11-29:  35 */ "@typescript-eslint/restrict-template-expressions",
      "canonical/filename-no-index",
    ]),
  },
  ignorePatterns: [
    ...require("@local/eslint-config/generate-ignore-patterns.cjs")(__dirname),
    "src/collab/**/*",
  ],
};
