/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  rules: {
    ...require("@local/eslint-config/temporarily-disable-rules.cjs")([
      /* 2022-11-15:   2 */ "@typescript-eslint/no-unsafe-argument",
      /* 2022-11-15:  54 */ "@typescript-eslint/no-unsafe-assignment",
      /* 2022-11-15:  27 */ "@typescript-eslint/no-unsafe-call",
      /* 2022-11-15:  75 */ "@typescript-eslint/no-unsafe-member-access",
      /* 2022-11-15:   2 */ "@typescript-eslint/no-unsafe-return",
      /* 2022-11-15:   2 */ "@typescript-eslint/require-await",
      /* 2022-11-15:   7 */ "@typescript-eslint/restrict-template-expressions",
    ]),
  },
  env: {
    node: true,
  },
};
