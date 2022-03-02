import { Components, Theme } from "@mui/material";

export const MuiIconButtonThemeOptions: Components<Theme>["MuiIconButton"] = {
  defaultProps: {
    disableFocusRipple: true,
    disableRipple: true,
    disableTouchRipple: true,
  },
  styleOverrides: {
    root: ({ theme }) => ({
      "&.MuiIconButton-sizeSmall": {},
      "&.MuiIconButton-sizeMedium": {
        height: 24,
        width: 24,
        padding: 0,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        color: theme.palette.gray[40],

        "& svg": {
          fontSize: 12,
          color: "currentColor",
        },

        "&:hover": {
          backgroundColor: theme.palette.gray[30],
          color: theme.palette.gray[80],
        },
      },
      "&.MuiIconButton-sizeLarge": {},
    }),
  },
};
