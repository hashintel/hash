import type { Components, Theme } from "@mui/material";
import { typographyClasses } from "@mui/material";

export const MuiTabThemeOptions: Components<Theme>["MuiTab"] = {
  styleOverrides: {
    root: ({ theme }) => ({
      marginRight: theme.spacing(3),
      padding: theme.spacing(1.25, 0.5),
      minWidth: 0,
      minHeight: 0,
    }),
    selected: ({ theme }) => ({
      ":hover": {
        [`.${typographyClasses.root}`]: {
          color: theme.palette.blue[70],
        },
      },
    }),
  },
};
