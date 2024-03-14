import type { Components, Theme } from "@mui/material";

export const MuiPaperThemeOptions: Components<Theme>["MuiPaper"] = {
  styleOverrides: {
    root: ({ ownerState, theme }) => ({
      borderRadius: 10,
      ...((ownerState.variant === "teal" || ownerState.variant === "aqua") && {
        borderWidth: 1,
        borderStyle: "solid",
        borderRadius: "6px",
      }),
      ...(ownerState.variant === "teal" && {
        borderColor: "#B0DDE9",
        backgroundColor: theme.palette.teal[10],
      }),
      ...(ownerState.variant === "aqua" && {
        borderColor: theme.palette.aqua[20],
        backgroundColor: theme.palette.aqua[10],
      }),
    }),
  },
};
