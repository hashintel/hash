/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-block-config.cjs")(__dirname),
  rules: {
    ...require("@local/eslint-config/temporarily-disable-rules.cjs")([
      /* 2022-11-11:   2 */ "@typescript-eslint/no-unsafe-call",
      /* 2022-11-11:   7 */ "@typescript-eslint/no-unsafe-member-access",
      /* 2022-11-11:   1 */ "@typescript-eslint/restrict-template-expressions",
    ]),
  },
};
