import type { Components, Theme } from "@mui/material";

// @todo rename this variables, use them instead of interpolation
const size = (padding: number) => ({
  "--maxWidth": `${1200 + padding * 2}px`,
  "--size": `min(100vw, var(--maxWidth))`,
  "--padding": `${padding}px`,
  maxWidth: "var(--maxWidth)",
  paddingLeft: `var(--padding)`,
  paddingRight: `var(--padding)`,
});

export const MuiContainerThemeOptions: Components<Theme>["MuiContainer"] = {
  styleOverrides: {
    root: ({ theme }) => ({
      ...size(16),
      [theme.breakpoints.up("sm")]: size(24),
      [theme.breakpoints.up("xl")]: size(32),
    }),
  },
};
