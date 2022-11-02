/**
 * @param {string} workspaceDirPath
 * @returns {import("eslint").Linter.Config}
 */
module.exports = (workspaceDirPath) => ({
  root: true,
  extends: ["@local/eslint-config/legacy-base-to-refactor.cjs"],
  ignorePatterns: require("./generate-ignore-patterns.cjs")(workspaceDirPath),
  parserOptions: {
    tsconfigRootDir: workspaceDirPath,
    project: `${workspaceDirPath}/tsconfig.json`,
  },
});
