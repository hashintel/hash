/** @type {import("eslint").Linter.Config} */
module.exports = {
  plugins: ["@typescript-eslint", "react-hooks", "react", "unicorn"],
  rules: {
    curly: ["error", "multi-line"],
    "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
    "jsx-a11y/label-has-associated-control": "off",
    "react-hooks/exhaustive-deps": "error",
    "react-hooks/rules-of-hooks": "error",
    "react/jsx-key": "error",
    "react/jsx-no-useless-fragment": "error",
    "react/no-danger": "error",
    "react/self-closing-comp": "error",
  },
};
