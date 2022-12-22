/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  rules: {
    "simple-import-sort/exports": "error",
    "simple-import-sort/imports": "error",
    "unicorn/filename-case": "error",
  },
};
