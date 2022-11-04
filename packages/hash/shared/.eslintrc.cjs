/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  rules: {
    "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
  },
};
