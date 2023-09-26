/** @type {import("eslint").Linter.Config} */
module.exports = {
  ...require("@local/eslint-config/generate-workspace-config.cjs")(__dirname),
  rules: {
    ...require("@local/eslint-config/temporarily-disable-rules.cjs")([
      /* 2022-11-29:  11 */ "@typescript-eslint/no-unsafe-argument",
      /* 2022-11-29:  54 */ "@typescript-eslint/no-unsafe-assignment",
      /* 2022-11-29:  30 */ "@typescript-eslint/no-unsafe-member-access",
      /* 2022-11-29:  11 */ "@typescript-eslint/no-unsafe-return",
      /* 2022-11-29:  34 */ "@typescript-eslint/restrict-template-expressions",
    ]),
    "import/no-default-export": "error",
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "@mui/material",
            importNames: [
              "Avatar",
              "Button",
              "Chip",
              "IconButton",
              "MenuItem",
              "Select",
              "TextField",
            ],
            message:
              "Please use the components from '@hashintel/design-system' instead.",
          },
        ],
        patterns: [
          {
            group: ["@mui/material/*"],
            message: "Please import from @mui/material instead",
          },
          {
            group: [
              "@hashintel/design-system/*",
              "!@hashintel/design-system/theme",
              "!@hashintel/design-system/constants",
            ],
            message: "Please import from @hashintel/design-system instead",
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: [
        "./src/app/**/api.ts",
        "./src/app/**/layout.tsx",
        "./src/app/**/page.tsx",
      ],
      rules: {
        "import/no-default-export": "off",
      },
    },
  ],
};
