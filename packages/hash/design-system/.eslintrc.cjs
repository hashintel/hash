/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  rules: {
    ...require("@local/eslint-config/temporarily-disable-rules.cjs")([
      /* 2022-11-29:  14 */ "@typescript-eslint/no-unsafe-assignment",
    ]),
    "jsx-a11y/label-has-associated-control": "off",
    "import/no-default-export": "error",
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@mui/material/*"],
            message: "Please import from @mui/material instead",
          },
        ],
      },
    ],
  },
  extends: ["plugin:storybook/recommended"],
};
