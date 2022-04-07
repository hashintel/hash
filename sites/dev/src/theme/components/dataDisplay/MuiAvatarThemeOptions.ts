import { Components, Theme } from "@mui/material";

// @todo why isn't this working?
export const MuiAvatarThemeOptions: Components<Theme>["MuiAvatar"] = {
  styleOverrides: {
    root: {
      backgroundColor: "yellow.900",
    },
  },
};
