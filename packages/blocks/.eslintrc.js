module.exports = {
  parserOptions: {
    // specifics
    jsx: true,
    useJSXTextNode: true,
  },
  plugins: ["@typescript-eslint", "react-hooks", "react"],
  rules: {
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "error",
    "react/jsx-key": "error",
    "react/jsx-no-useless-fragment": "error",
    "react/no-danger": "error",
    "react/self-closing-comp": "error",
    curly: ["error", "multi-line"],
    "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
    "jsx-a11y/label-has-associated-control": "off",
  },
};
