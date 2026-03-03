import {
  defineConfig,
  createBase,
  disableRules,
} from "@local/eslint/deprecated";

export default [
  ...createBase(import.meta.dirname),
  ...disableRules([
    /* 2022-11-29:  11 */ "@typescript-eslint/no-unsafe-argument",
    /* 2022-11-29:  54 */ "@typescript-eslint/no-unsafe-assignment",
    /* 2022-11-29:  30 */ "@typescript-eslint/no-unsafe-member-access",
    /* 2022-11-29:  11 */ "@typescript-eslint/no-unsafe-return",
    /* 2022-11-29:  34 */ "@typescript-eslint/restrict-template-expressions",
  ]),
  ...defineConfig([
    {
      rules: {
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
                  "Tabs",
                ],
                message:
                  "Please use the custom wrapper component from src/shared/ui for Link, Button, Tabs and MenuItem and from '@hashintel/design-system' for every other component.",
              },
              {
                name: "notistack",
                importNames: ["useSnackbar"],
                message:
                  "Please use the custom src/components/hooks/useSnackbar hook instead.",
              },
              {
                name: "@hashintel/design-system",
                importNames: ["Button", "Link", "MenuItem"],
                message:
                  "Please use the custom wrapper component in src/shared/ui component instead",
              },
            ],
            patterns: [
              // @ts-expect-error: invalid typing
              {
                group: ["@mui/material/*"],
                message: "Please import from @mui/material instead",
              },
              // @ts-expect-error: invalid typing
              {
                group: [
                  "@hashintel/design-system/*",
                  "!@hashintel/design-system/theme",
                  "!@hashintel/design-system/constants",
                  "!@hashintel/design-system/palettes",
                ],
                message: "Please import from @hashintel/design-system instead",
              },
            ],
          },
        ],
      },
    },
    {
      files: [
        "**/src/pages/**/*.api.ts",
        "**/src/pages/**/*.page.ts",
        "**/src/pages/**/*.page.tsx",
        "**/__mocks__/**",
      ],
      rules: {
        "import/no-default-export": "off",
      },
    },
    {
      ignores: ["buildstamp.js", "next.config.js", "next-env.d.ts"],
    },
  ]),
];
