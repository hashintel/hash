/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  rules: {
    ...require("@local/eslint-config/temporarily-disable-rules.cjs")([
      /* 2022-11-15:  19 */ "@typescript-eslint/no-unsafe-argument",
      /* 2022-11-15:  68 */ "@typescript-eslint/no-unsafe-assignment",
      /* 2022-11-15:  58 */ "@typescript-eslint/no-unsafe-call",
      /* 2022-11-15: 125 */ "@typescript-eslint/no-unsafe-member-access",
      /* 2022-11-15:  20 */ "@typescript-eslint/no-unsafe-return",
      /* 2022-11-15:   3 */ "@typescript-eslint/require-await",
      /* 2022-11-15:   5 */ "@typescript-eslint/restrict-plus-operands",
      /* 2022-11-15:   5 */ "@typescript-eslint/restrict-template-expressions",
    ]),
    "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
  },
  overrides: [
    {
      files: ["./src/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["@hashintel/hash-backend-utils/*"],
                message:
                  "This package is shared by FE and BE, move backend utils here if both need them.",
              },
            ],
          },
        ],
      },
    },
  ],
};
