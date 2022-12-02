/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  rules: {
    ...require("@local/eslint-config/temporarily-disable-rules.cjs")([
      /* 2022-11-29:  13 */ "@typescript-eslint/no-unsafe-assignment",
      /* 2022-11-29:  13 */ "@typescript-eslint/no-unsafe-member-access",
      /* 2022-11-29:  11 */ "@typescript-eslint/restrict-template-expressions",
    ]),
    "jsx-a11y/label-has-associated-control": "off",
    "import/no-default-export": "error",
  },
  overrides: [
    {
      files: [
        "./src/pages/**/*.page.ts",
        "./src/pages/**/*.page.tsx",
        "**/__mocks__/**",
        "*.stories.ts",
        "*.stories.tsx",
      ],
      rules: {
        "import/no-default-export": "off",
      },
    },
  ],
};
