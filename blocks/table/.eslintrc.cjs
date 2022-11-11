/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-block-config.cjs")(__dirname),
  rules: {
    ...require("@local/eslint-config/disable-until-fixed.cjs")([
      /* 2022-11-11:   1 */ "@typescript-eslint/no-unsafe-argument",
      /* 2022-11-11:  12 */ "@typescript-eslint/no-unsafe-assignment",
      /* 2022-11-11:   6 */ "@typescript-eslint/no-unsafe-member-access",
      /* 2022-11-11:   6 */ "@typescript-eslint/no-unsafe-return",
    ]),
  },
};
