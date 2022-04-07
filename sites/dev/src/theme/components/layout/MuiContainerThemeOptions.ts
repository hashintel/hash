import { Components } from "@mui/material";

const size = (padding: number) => ({
  maxWidth: `${1200 + padding * 2}px`,
  paddingLeft: `${padding}px`,
  paddingRight: `${padding}px`,
});

export const MuiContainerThemeOptions: Components["MuiContainer"] = {
  styleOverrides: {
    root: {
      ...size(16),
      "@media (min-width: 600px)": size(24),
      "@media (min-width: 1536px)": size(32),
    },
  },
};
