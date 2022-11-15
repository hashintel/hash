/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  plugins: ["@typescript-eslint", "canonical", "unicorn"],
  rules: {
    ...require("@local/eslint-config/temporarily-disable-rules.cjs")([
      /* 2022-11-15:  14 */ "@typescript-eslint/no-unsafe-assignment",
    ]),
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
