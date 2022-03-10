/**
 * @todo update from blockprotocol
 */
import { Components, Theme } from "@mui/material";

export const MuiIconButtonThemeOptions: Components<Theme>["MuiIconButton"] = {
  defaultProps: {
    disableFocusRipple: true,
    disableRipple: true,
    disableTouchRipple: true,
  },
  styleOverrides: {
    root: ({ theme }) => ({
      "&:hover": {
        svg: {
          color: theme.palette.purple[600],
        },
      },
      "&:active": {
        svg: {
          color: theme.palette.purple[700],
        },
      },
      "&:focus": {
        border: "none !important",
        borderRadius: 0,
      },
      "&:focus-visible": {
        borderRadius: 0,
        border: "none !important",
        outline: `1px solid ${theme.palette.purple[600]}`,
      },
      svg: {
        color: theme.palette.gray[70],
        transition: theme.transitions.create("color"),
      },
    }),
  },
};
