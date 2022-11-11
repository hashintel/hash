/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  env: {
    node: true,
  },
  rules: {
    ...require("@local/eslint-config/disable-until-fixed.cjs")([
      /* 2022-11-11:  1 */ "@typescript-eslint/require-await",
    ]),
  },
};
