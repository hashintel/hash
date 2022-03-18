import { Components, Theme } from "@mui/material";

export const MuiMenuThemeOptions: Components<Theme>["MuiMenu"] = {
  defaultProps: {
    MenuListProps: {
      sx: {
        paddingTop: "4px",
        paddingBottom: "4px",
      },
    },
    PaperProps: {
      sx: {
        minWidth: 228,
      },
    },
  },
  styleOverrides: {
    root: () => ({}),
  },
};
