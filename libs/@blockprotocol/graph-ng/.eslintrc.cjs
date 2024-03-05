/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  rules: {
    "unicorn/filename-case": "off",
    "@typescript-eslint/no-redeclare": "off",
  },
};
