/**
 * @todo update from blockprotocol
 */
import { Components, Theme } from "@mui/material";

export const MuiInputLabelThemeOptions: Components<Theme>["MuiInputLabel"] = {
  defaultProps: {
    disableAnimation: true,
    shrink: true,
  },
  styleOverrides: {
    root: ({ theme }) => ({
      position: "unset",
      left: "unset",
      top: "unset",
      transform: "unset",
      fontSize: theme.typography.bpSmallCopy.fontSize,
      fontWeight: 500,
      marginBottom: theme.spacing(0.5),
    }),
  },
};
