/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: ["@local/eslint-config/legacy-base-to-refactor.cjs"],
  noInlineConfig: true,
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ["tsconfig.json"],
  },
  plugins: ["typescript-sort-keys"],
  rules: {
    "typescript-sort-keys/interface": "error",
  },
};
