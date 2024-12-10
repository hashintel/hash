/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  rules: {
    "@typescript-eslint/no-redeclare": "off",
    "unicorn/filename-case": "off",
    "func-names": "off",
    "canonical/filename-no-index": "off",
  },
  ignorePatterns: require("@local/eslint-config/generate-ignore-patterns.cjs")(
    __dirname,
  ),
};
