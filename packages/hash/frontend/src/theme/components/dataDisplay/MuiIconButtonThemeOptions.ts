import { Components, Theme } from "@mui/material";

export const MuiIconButtonThemeOptions: Components<Theme>["MuiIconButton"] = {
  defaultProps: {
    disableFocusRipple: true,
    disableRipple: true,
    disableTouchRipple: true,
  },
  styleOverrides: {
    root: ({ ownerState, theme }) => ({
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      color: theme.palette.gray[40],

      "& svg": {
        color: "currentColor",
      },

      "&:hover": {
        backgroundColor: theme.palette.gray[30],
        color: theme.palette.gray[80],
      },

      "&:focus": {
        outlineColor: theme.palette.blue[70],
        outlineOffset: "2px",
      },

      ...(ownerState.size === "small" && {}),

      ...(ownerState.size === "medium" && {
        height: 24,
        width: 24,
        padding: 0,

        "& svg": {
          fontSize: 12,
        },
      }),

      ...(ownerState.size === "large" && {}),
    }),
  },
};
