import { Components, dividerClasses, Theme } from "@mui/material";

export const MuiMenuThemeOptions: Components<Theme>["MuiMenu"] = {
  defaultProps: {
    elevation: 4,
    autoFocus: false,
  },
  styleOverrides: {
    list: ({ theme }) => ({
      padding: theme.spacing(0.5),

      [`.${dividerClasses.root}`]: {
        marginTop: theme.spacing(0.75),
        marginBottom: theme.spacing(0.75),
        // this resets the horizontal padding
        // set above and ensures the divider runs
        // end to end
        marginLeft: theme.spacing(-0.5),
        marginRight: theme.spacing(-0.5),
      },
    }),
    paper: {
      minWidth: 228,
    },
  },
};
