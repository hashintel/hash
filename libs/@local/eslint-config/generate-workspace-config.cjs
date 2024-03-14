/**
 * @param {string} workspaceDirPath
 * @returns {import("eslint").Linter.Config}
 */
module.exports = (workspaceDirPath) => ({
  root: true,
  extends: ["@local/eslint-config/legacy-base-eslintrc-to-refactor.cjs"],
  ignorePatterns: require("./generate-ignore-patterns.cjs")(workspaceDirPath),
  parserOptions: {
    tsconfigRootDir: workspaceDirPath,
    project: `${workspaceDirPath}/tsconfig.json`,
  },
  settings: {
    "import/resolver": {
      typescript: {
        alwaysTryTypes: true,
        project: `${workspaceDirPath}}/tsconfig.json`,
      },
    },
  },
});
