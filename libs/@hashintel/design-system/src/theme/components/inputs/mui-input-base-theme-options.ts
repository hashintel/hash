import type { Components, Theme } from "@mui/material";

export const MuiInputBaseThemeOptions: Components<Theme>["MuiInputBase"] = {
  defaultProps: {
    inputProps: {
      "data-1p-ignore": true,
    },
  },
  styleOverrides: {
    input: {
      /**
       * This hides the Safari contact autofill button for all inputs. Note that
       * this doesn't affect the autofill button for other inputs, such as the
       * login credentials button. These can be similarly overridden using the
       * `::-webkit-credentials-auto-fill-button` CSS selector.
       */
      "&::-webkit-contacts-auto-fill-button": {
        visibility: "hidden",
        display: "none !important",
      },
    },
  },
};
