/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  env: {
    node: true,
  },
  rules: {
    "no-console": "off",
    ...require("@local/eslint-config/disable-until-fixed.cjs")([
      /* 2022-11-11:   2 */ "@typescript-eslint/no-unsafe-argument",
      /* 2022-11-11:   8 */ "@typescript-eslint/no-unsafe-assignment",
      /* 2022-11-11:   5 */ "@typescript-eslint/no-unsafe-call",
      /* 2022-11-11:   5 */ "@typescript-eslint/no-unsafe-member-access",
      /* 2022-11-11:   2 */ "@typescript-eslint/no-unsafe-return",
    ]),
  },
};
