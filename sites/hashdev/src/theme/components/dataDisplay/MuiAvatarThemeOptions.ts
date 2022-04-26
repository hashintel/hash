import { Components, Theme } from "@mui/material";

// @todo why isn't this working?
export const MuiAvatarThemeOptions: Components<Theme>["MuiAvatar"] = {
  styleOverrides: {
    root: ({ theme }) => ({
      backgroundColor: theme.palette.yellow[900],
      width: 48,
      height: 48,
    }),
  },
};
