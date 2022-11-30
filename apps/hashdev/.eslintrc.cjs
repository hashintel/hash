/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  rules: {
    ...require("@local/eslint-config/temporarily-disable-rules.cjs")([
      /* 2022-11-15:  19 */ "@typescript-eslint/no-unsafe-assignment",
      /* 2022-11-15:   5 */ "@typescript-eslint/no-unsafe-call",
      /* 2022-11-15:  21 */ "@typescript-eslint/no-unsafe-member-access",
      /* 2022-11-15:   1 */ "@typescript-eslint/no-unsafe-return",
      /* 2022-11-15:   2 */ "@typescript-eslint/require-await",
      /* 2022-11-15:  11 */ "@typescript-eslint/restrict-template-expressions",
      /* 2022-11-15:   1 */ "@typescript-eslint/unbound-method",
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
