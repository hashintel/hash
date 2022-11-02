/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  noInlineConfig: true,
  plugins: ["typescript-sort-keys"],
  rules: {
    "typescript-sort-keys/interface": "error",
  },
};
