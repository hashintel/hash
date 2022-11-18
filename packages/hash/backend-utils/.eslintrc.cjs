/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  rules: {
    ...require("@local/eslint-config/temporarily-disable-rules.cjs")([
      /* 2022-11-15:   1 */ "@typescript-eslint/no-unsafe-argument",
      /* 2022-11-15:  10 */ "@typescript-eslint/no-unsafe-assignment",
      /* 2022-11-15:   3 */ "@typescript-eslint/no-unsafe-call",
      /* 2022-11-15:  21 */ "@typescript-eslint/no-unsafe-member-access",
      /* 2022-11-15:   1 */ "@typescript-eslint/no-unsafe-return",
      /* 2022-11-15:   1 */ "@typescript-eslint/require-await",
      /* 2022-11-15:   4 */ "@typescript-eslint/restrict-template-expressions",
      /* 2022-11-15:  11 */ "@typescript-eslint/unbound-method",
    ]),
  },
};
