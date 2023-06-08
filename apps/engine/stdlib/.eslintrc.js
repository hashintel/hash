module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
    "jest/globals": true,
  },
  extends: ["standard"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 12,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint", "jest"],
  rules: {
    quotes: [1, "double", "avoid-escape"],
    semi: [1, "always"],
    "space-before-function-paren": 0,
    "comma-dangle": 0,
    camelcase: 0,
  },
  overrides: [
    {
      files: ["*.spec.ts"],
      rules: {
        "no-unused-expressions": "off",
      },
    },
  ],
  ignorePatterns: ["**/dist"],
};
