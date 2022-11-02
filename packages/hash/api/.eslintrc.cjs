/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: ["@local/eslint-config/legacy-base-to-refactor.cjs"],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ["tsconfig.json"],
  },
  env: {
    node: true,
  },
  rules: {
    // @todo Re-enable these rules once ESLint config is refactored
    "@typescript-eslint/restrict-plus-operands": "off",
    "@typescript-eslint/prefer-nullish-coalescing": "off",
  },
  ignorePatterns: ["src/collab/**/*"],
};
