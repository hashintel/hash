/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  rules: {
    ...require("@local/eslint-config/temporarily-disable-rules.cjs")([
      /* 2022-11-15:   3 */ "@typescript-eslint/restrict-template-expressions",
    ]),
  },
  overrides: [
    {
      files: ["**/*.{spec,test}.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            paths: [
              {
                name: "@playwright/test",
                message: "Please import from ./shared/runtime instead",
              },
            ],
          },
        ],
      },
    },
  ],
};
