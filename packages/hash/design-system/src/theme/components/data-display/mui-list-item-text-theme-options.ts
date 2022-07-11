import { Components, Theme } from "@mui/material";

export const MuiListItemTextThemeOptions: Components<Theme>["MuiListItemText"] =
  {
    defaultProps: {
      primaryTypographyProps: {
        variant: "smallTextLabels",
      },
      secondaryTypographyProps: {
        variant: "microText",
      },
    },
  };
