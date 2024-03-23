import { create } from "@repo/eslint";

export default create({
  enabled: {
    frontend: true,
    playwright: false,
    tests: false,
  },
  noRestrictedImports: () => [
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
});
