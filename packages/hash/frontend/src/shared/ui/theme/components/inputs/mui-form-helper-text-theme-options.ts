import { Components, Theme, typographyClasses } from "@mui/material";

export const MuiFormHelperTextThemeOptions: Components<Theme>["MuiFormHelperText"] =
  {
    defaultProps: {},
    styleOverrides: {
      root: ({ ownerState = {}, theme }) => ({
        marginLeft: 0,
        ...(ownerState.error && {
          [`.${typographyClasses.root}`]: {
            color: theme.palette.orange[80],
          },

          svg: {
            color: theme.palette.orange[50],
            marginRight: theme.spacing(1),
          },
        }),
      }),
    },
  };
