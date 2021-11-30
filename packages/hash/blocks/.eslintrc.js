module.exports = {
  parserOptions: {
    // specifics
    jsx: true,
    useJSXTextNode: true,
  },
  overrides: [
    {
      files: ["*.ts", "*.tsx"],
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: ["../../../tsconfig.base.json"],
      },
    },
  ],
  plugins: ["@typescript-eslint", "react-hooks", "react"],
  rules: {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "error",
    "react/jsx-key": "error",
    "react/jsx-no-useless-fragment": "error",
    "react/self-closing-comp": "warn",
    curly: ["error", "multi-line"],
    "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
    "jsx-a11y/label-has-associated-control": "off",
  },
};
