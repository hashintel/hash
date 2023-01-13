/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("./generate-workspace-config.cjs")(__dirname),
  rules: {
    "global-require": "off",
  },
};
