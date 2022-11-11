/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  rules: {
    ...require("@local/eslint-config/disable-until-fixed.cjs")([
      /* 2022-11-11:  21 */ "@typescript-eslint/no-unsafe-call",
      /* 2022-11-11:  3 */ "@typescript-eslint/restrict-template-expressions",
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
