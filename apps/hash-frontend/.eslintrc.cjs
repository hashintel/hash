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
    "jsx-a11y/label-has-associated-control": "off",
    "import/no-default-export": "error",
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "next",
            importNames: ["Link"],
            message:
              "Please use the custom wrapper component in src/shared/ui component instead to ensure Next.js and MUI compatibility.",
          },
          {
            name: "next/link",
            message:
              "Please use the custom wrapper component in src/shared/ui component instead to ensure Next.js and MUI compatibility.",
          },
          {
            name: "@mui/material",
            importNames: [
              "Avatar",
              "IconButton",
              "Chip",
              "TextField",
              "Select",
              "Link",
              "Button",
              "MenuItem",
            ],
            message:
              "Please use the custom wrapper component from src/shared/ui for Link, Button and MenuItem and from '@local/design-system' for every other component.",
          },
          {
            name: "notistack",
            importNames: ["useSnackbar"],
            message:
              "Please use the custom src/components/hooks/useSnackbar hook instead.",
          },
        ],
        patterns: [
          {
            group: ["@mui/material/*"],
            message: "Please import from @mui/material instead",
          },
          {
            group: ["@local/design-system/*"],
            message: "Please import from @local/design-system instead",
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: [
        "./src/pages/**/*.api.ts",
        "./src/pages/**/*.page.ts",
        "./src/pages/**/*.page.tsx",
        "**/__mocks__/**",
      ],
      rules: {
        "import/no-default-export": "off",
      },
    },
  ],
};
