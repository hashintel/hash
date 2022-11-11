/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  rules: {
    ...require("@local/eslint-config/disable-until-fixed.cjs")([
      /* 2022-11-11:   2 */ "@typescript-eslint/no-unsafe-argument",
      /* 2022-11-11:  60 */ "@typescript-eslint/no-unsafe-assignment",
      /* 2022-11-11:  31 */ "@typescript-eslint/no-unsafe-call",
      /* 2022-11-11:  76 */ "@typescript-eslint/no-unsafe-member-access",
      /* 2022-11-11:   2 */ "@typescript-eslint/no-unsafe-return",
      /* 2022-11-11:   2 */ "@typescript-eslint/require-await",
      /* 2022-11-11:   7 */ "@typescript-eslint/restrict-template-expressions",
    ]),
  },
  env: {
    node: true,
  },
};
