/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  rules: {
    // @todo Re-enable these rules once ESLint config is refactored
    "@typescript-eslint/restrict-plus-operands": "off",
    "@typescript-eslint/prefer-nullish-coalescing": "off",
  },
  ignorePatterns: [
    ...require("@local/eslint-config/generate-ignore-patterns.cjs")(__dirname),
    "src/collab/**/*",
  ],
};
