/**
 * @param {string} workspaceDirPath
 * @returns {import("eslint").Linter.Config}
 */
module.exports = (workspaceDirPath) => ({
  root: true,
  extends: [
    "@local/eslint-config/legacy-base-config-to-refactor.cjs",
    "@local/eslint-config/legacy-block-config-to-refactor.cjs",
  ],
  ignorePatterns: require("./generate-ignore-patterns.cjs")(workspaceDirPath),
  parserOptions: {
    tsconfigRootDir: workspaceDirPath,
    project: `${workspaceDirPath}/tsconfig.json`,
  },
});
