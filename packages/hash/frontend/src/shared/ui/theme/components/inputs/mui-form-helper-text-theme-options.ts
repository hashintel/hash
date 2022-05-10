import { Components, Theme } from "@mui/material";

export const MuiFormHelperTextThemeOptions: Components<Theme>["MuiFormHelperText"] =
  {
    defaultProps: {},
    styleOverrides: {
      root: ({ ownerState = {}, theme }) => ({
        ...(ownerState.error && {
          color: theme.palette.orange[80],

          svg: {
            color: theme.palette.orange[50],
          },
        }),
      }),
    },
  };
