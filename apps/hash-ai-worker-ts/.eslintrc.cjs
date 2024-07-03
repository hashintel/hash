/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  env: {
    node: true,
  },
  plugins: ["file-extension-in-import-ts"],
  rules: {
    "file-extension-in-import-ts/file-extension-in-import-ts": "error",
  },
};
