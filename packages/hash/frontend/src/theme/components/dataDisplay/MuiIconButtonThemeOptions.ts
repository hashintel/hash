import { Components, CSSObject, Theme } from "@mui/material";

const buttonFocusBorderOffset = 4;
const buttonFocusBorderWidth = 3;

export const MuiIconButtonThemeOptions: Components<Theme>["MuiIconButton"] = {
  defaultProps: {
    disableRipple: true,
    disableTouchRipple: true,
  },
  styleOverrides: {
    root: ({ theme }) => {
      // The base CSS styling applied to the button
      const baseStyles: CSSObject = {
        textTransform: "none",
        minWidth: "unset",
        padding: "unset",
        color: theme.palette.gray[40],
        background: theme.palette.gray[20],
      };

      // The :before CSS styling applied to the button
      const beforeStyles: CSSObject = {
        content: `""`,
        borderRadius: "inherit",
        position: "absolute",
        width: "100%",
        height: "100%",
        border: "1px solid transparent",
      };

      // The :hover CSS styling applied to the button
      const hoverStyles: CSSObject = {
        color: theme.palette.common.white,
        backgroundColor: theme.palette.blue["70"],
      };

      // The :hover:before CSS styling applied to the button
      const hoverBeforeStyles: CSSObject = {};

      // The .Mui-disabled CSS styling applied to the button
      const disabledStyles: CSSObject = {};

      // The :active CSS styling applied to the button
      const activeStyles: CSSObject = {};

      // The :focus CSS styling applied to the button
      const focusStyles: CSSObject = { outline: "none" };

      // The :focus-visible:after CSS styling applied to the button
      const focusVisibleAfterStyles: CSSObject = {
        content: `""`,
        position: "absolute",
        left: -buttonFocusBorderOffset,
        top: -buttonFocusBorderOffset,
        bottom: -buttonFocusBorderOffset,
        right: -buttonFocusBorderOffset,
        border: `${buttonFocusBorderWidth}px solid`,
        borderRadius: 6 + buttonFocusBorderOffset,
        borderColor: theme.palette.blue["70"],
      };

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
