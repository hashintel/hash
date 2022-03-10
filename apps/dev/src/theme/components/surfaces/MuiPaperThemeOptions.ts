/**
 * @todo update from blockprotocol
 */
import { Components, Theme } from "@mui/material";

export const MuiPaperThemeOptions: Components<Theme>["MuiPaper"] = {
  styleOverrides: {
    root: ({ ownerState, theme }) => ({
      borderRadius: 10,
      ...((ownerState.variant === "teal" ||
        ownerState.variant === "purple") && {
        borderWidth: 1,
        borderStyle: "solid",
        borderRadius: "6px",
      }),
      ...(ownerState.variant === "teal" && {
        borderColor: "#B0DDE9",
        backgroundColor: theme.palette.teal[100],
      }),
      ...(ownerState.variant === "purple" && {
        borderColor: theme.palette.purple[200],
        backgroundColor: theme.palette.purple[100],
      }),
    }),
  },
};
