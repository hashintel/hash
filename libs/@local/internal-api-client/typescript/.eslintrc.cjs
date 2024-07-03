/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  plugins: ["file-extension-in-import-ts"],
  env: {
    node: true,
  },
  rules: {
    "file-extension-in-import-ts/file-extension-in-import-ts": "error",
  },
};
