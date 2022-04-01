import { Components, Theme } from "@mui/material";

export const MuiInputBaseThemeOptions: Components<Theme>["MuiInputBase"] = {
  styleOverrides: {
    adornedEnd: ({ theme }) => ({
      "&.Mui-error": {
        svg: {
          // @todo use theme
          color: "#E04D82",
        },
      },
    }),
  },
};
