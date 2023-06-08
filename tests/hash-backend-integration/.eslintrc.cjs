/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  rules: {
    ...require("@local/eslint-config/temporarily-disable-rules.cjs")([
      /* 2022-11-29:  82 */ "@typescript-eslint/no-unsafe-assignment",
      /* 2022-11-29:  28 */ "@typescript-eslint/no-unsafe-call",
      /* 2022-11-29:  81 */ "@typescript-eslint/no-unsafe-member-access",
    ]),
  },
  env: {
    node: true,
  },
};
