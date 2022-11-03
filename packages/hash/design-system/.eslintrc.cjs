/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  plugins: ["@typescript-eslint", "canonical", "unicorn"],
  rules: {
    "jsx-a11y/label-has-associated-control": "off",
    "import/no-default-export": "error",
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "@mui/material/*",
            message: "Please import from @mui/material instead",
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: ["./src/**/*"],
      rules: {
        "canonical/filename-no-index": "error",
        "unicorn/filename-case": "error",
      },
    },
  ],
};
