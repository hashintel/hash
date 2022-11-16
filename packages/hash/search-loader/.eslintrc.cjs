/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  env: {
    node: true,
  },
  rules: {
    ...require("@local/eslint-config/temporarily-disable-rules.cjs")([
      /* 2022-11-16:  11 */ "@typescript-eslint/no-unsafe-assignment",
      /* 2022-11-16:  13 */ "@typescript-eslint/no-unsafe-member-access",
    ]),
  },
};
