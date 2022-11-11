/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-block-config.cjs")(__dirname),
  rules: {
    ...require("@local/eslint-config/disable-until-fixed.cjs")([
      /* 2022-11-11:  1 */ "@typescript-eslint/no-unsafe-assignment",
      /* 2022-11-11:  2 */ "@typescript-eslint/no-unsafe-member-access",
      /* 2022-11-11:  2 */ "@typescript-eslint/no-unsafe-return",
      /* 2022-11-11:  2 */ "@typescript-eslint/restrict-template-expressions",
    ]),
  },
};
