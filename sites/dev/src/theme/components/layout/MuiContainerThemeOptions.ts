import { Components } from "@mui/material";

// @todo rename this variables, use them instead of interpolation
const size = (padding: number) => ({
  "--maxWidth": `${1200 + padding * 2}px`,
  "--size": `min(100vw, var(--maxWidth))`,
  "--padding": `${padding}px`,
  maxWidth: "var(--maxWidth)",
  paddingLeft: `var(--padding)`,
  paddingRight: `var(--padding)`,
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
