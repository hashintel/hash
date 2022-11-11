/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  rules: {
    ...require("@local/eslint-config/temporarily-disable-rules.cjs")([
      /* 2022-11-11:   9 */ "@typescript-eslint/no-unsafe-argument",
      /* 2022-11-11:  18 */ "@typescript-eslint/no-unsafe-assignment",
      /* 2022-11-11:   6 */ "@typescript-eslint/no-unsafe-call",
      /* 2022-11-11:   7 */ "@typescript-eslint/no-unsafe-member-access",
      /* 2022-11-11:   6 */ "@typescript-eslint/no-unsafe-return",
      /* 2022-11-11:   3 */ "@typescript-eslint/require-await",
      /* 2022-11-11:   5 */ "@typescript-eslint/restrict-template-expressions",
    ]),
    "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
  },
};
