import { Components, CSSObject, Theme } from "@mui/material";

export const MuiListItemButtonThemeOptions: Components<Theme>["MuiListItemButton"] =
  {
    defaultProps: {
      disableRipple: true,
    },
    styleOverrides: {
      root: ({ theme }) => {
        // The base CSS styling applied to the button
        const baseStyles: CSSObject = {
          textTransform: "none",
          minWidth: "unset",
          padding: theme.spacing(1, 1.5),
          color: theme.palette.gray[40],
        };

        // The :before CSS styling applied to the button
        const beforeStyles: CSSObject = {};

        // The :hover CSS styling applied to the button
        const hoverStyles: CSSObject = {};

        // The :hover:before CSS styling applied to the button
        const hoverBeforeStyles: CSSObject = {};

        // The .Mui-disabled CSS styling applied to the button
        const disabledStyles: CSSObject = {};

        // The :active CSS styling applied to the button
        const activeStyles: CSSObject = {};

        // The :focus CSS styling applied to the button
        const focusStyles: CSSObject = {};

        // The :focus-visible:after CSS styling applied to the button
        const focusVisibleAfterStyles: CSSObject = {};

        return {
          ...baseStyles,
          "&:before": beforeStyles,
          ":hover": hoverStyles,
          "&:hover:before": hoverBeforeStyles,
          ":active": activeStyles,
          "&.Mui-disabled": disabledStyles,
          ":focus-visible:after": focusVisibleAfterStyles,
          ":focus": focusStyles,
        };
      },
    },
  };
