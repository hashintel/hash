/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: ["@local/eslint-config/legacy-base-to-refactor.cjs"],
  env: {
    node: true,
  },
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ["tsconfig.json"],
  },
};
