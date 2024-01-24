/**
 * @param {string} workspaceDirPath
 * @returns {import("eslint").Linter.Config}
 */
module.exports = (workspaceDirPath) => ({
  root: true,
  extends: [
    "@local/eslint-config/legacy-base-eslintrc-to-refactor.cjs",
    "@local/eslint-config/legacy-block-eslintrc-to-refactor.cjs",
  ],
  ignorePatterns: require("./generate-ignore-patterns.cjs")(workspaceDirPath),
  parserOptions: {
    tsconfigRootDir: workspaceDirPath,
    project: `${workspaceDirPath}/tsconfig.json`,
  },
  overrides: [
    {
      files: ["**/src/types/**"],
      rules: {
        "@typescript-eslint/ban-types": [
          "error",
          {
            types: {
              /**
               * @todo update the codegen utility in @blockprotocol/graph to generate Object as Record<string, unknown>, not {}
               */
              "{}": false,
            },
            extendDefaults: true,
          },
        ],
      },
    },
  ],
});
