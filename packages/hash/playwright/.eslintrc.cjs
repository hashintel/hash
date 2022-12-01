/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
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
