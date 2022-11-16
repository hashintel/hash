/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  rules: {
    ...require("@local/eslint-config/temporarily-disable-rules.cjs")([
      /* 2022-11-15:  15 */ "@typescript-eslint/no-unsafe-member-access",
      /* 2022-11-15:  11 */ "@typescript-eslint/unbound-method",
    ]),
  },
};
