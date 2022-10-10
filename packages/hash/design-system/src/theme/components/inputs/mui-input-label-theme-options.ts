import { Components, Theme } from "@mui/material";

export const MuiInputLabelThemeOptions: Components<Theme>["MuiInputLabel"] = {
  defaultProps: {
    disableAnimation: true,
    shrink: false,
    variant: "standard",
  },
  styleOverrides: {
    root: ({ theme }) => ({
      position: "relative",
      left: "unset",
      top: "unset",
      transform: "unset",
      ...theme.typography.smallTextLabels,
      color: theme.palette.gray[70],
      fontWeight: 500,
      marginBottom: theme.spacing(0.75),
    }),
    asterisk: ({ theme }) => ({ color: theme.palette.blue[70] }),
  },
};
