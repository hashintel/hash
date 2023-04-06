/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  extends: ["plugin:storybook/recommended", "plugin:storybook/recommended"],
};
