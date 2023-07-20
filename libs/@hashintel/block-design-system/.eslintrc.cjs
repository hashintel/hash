/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  extends: [
    "plugin:storybook/recommended",
    "@local/eslint-config/legacy-base-eslintrc-to-refactor.cjs",
  ],
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
            group: ["*/main"],
            message:
              "Please import from the component file directly, not main.ts",
          },
          {
            group: ["@mui/material/*"],
            message: "Please import from @mui/material instead",
          },
          {
            group: ["@local/*"],
            message:
              "You cannot use unpublished local packages in a published package.",
          },
        ],
      },
    ],
    "storybook/no-uninstalled-addons": [
      "error",
      { packageJsonLocation: `${__dirname}/package.json` },
    ],
  },
  overrides: [
    {
      files: ["*.stories.{j,t}s{x,}"],
      rules: {
        "import/no-default-export": "off",
      },
    },
  ],
};
