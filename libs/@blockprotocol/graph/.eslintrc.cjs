/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  plugins: ["file-extension-in-import-ts"],
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "file-extension-in-import-ts/file-extension-in-import-ts": "error",
  },
};
