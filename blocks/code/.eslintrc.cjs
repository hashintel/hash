/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-base-config.cjs")(__dirname),
  extends: ["@local/eslint-config/block.cjs"],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ["tsconfig.json"],
  },
};
