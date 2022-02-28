import { Components, CSSObject, Theme } from "@mui/material";

const buttonFocusBorderOffset = 4;
const buttonFocusBorderWidth = 3;

export const MuiButtonThemeOptions: Components<Theme>["MuiButton"] = {
  defaultProps: {
    variant: "primary",
    disableElevation: true,
    disableRipple: true,
    disableTouchRipple: true,
  },
  styleOverrides: {
    root: ({ ownerState, theme }) => {
      const { variant, size } = ownerState;

      // The base CSS styling applied to the button
      const baseStyles: CSSObject = {
        textTransform: "none",
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
      const hoverStyles: CSSObject = {};

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

      if (variant === "primary") {
        /** ===== PRIMARY button specific styling ===== */

        Object.assign(baseStyles, {
          color: theme.palette.common.white,
          background: theme.palette.blue[70],
          backgroundColor: theme.palette.blue[70],
          transition: "all 0.5s ease-in-out",
          ...(size === "small" && {
            padding: theme.spacing("8px", "20px"),
          }),
          ...(size === "medium" && {
            padding: theme.spacing("12px", "28px"),
            minHeight: 51,
          }),
        });

        Object.assign(hoverStyles, {
          background: theme.palette.purple.gradient,
        });
      } else if (variant === "tertiary_quiet") {
        /** ===== TERTIARY button specific styling ===== */

        Object.assign(baseStyles, {
          color: theme.palette.gray[70],
          background: theme.palette.common.white,
          "& > .MuiButton-startIcon, > .MuiButton-endIcon": {
            color: theme.palette.gray[40],
          },
        });

        Object.assign(hoverStyles, {
          color: theme.palette.gray[80],
        });
      } else if (variant === "transparent") {
        /** ===== TRANSPARENT button specific styling ===== */

        Object.assign(baseStyles, {
          minWidth: "unset",
          padding: "unset",
          color: theme.palette.gray[50],
        });
        Object.assign(hoverStyles, {
          color: theme.palette.purple["90"],
          backgroundColor: "unset",
        });
        Object.assign(focusVisibleAfterStyles, {
          borderWidth: 1,
          bottom: 0,
          top: 0,
          borderRadius: 0,
        });
      } else if (variant === "icon") {
        Object.assign(baseStyles, {
          minWidth: "unset",
          padding: "unset",
          color: theme.palette.gray[40],
          background: theme.palette.gray[20],
        });

        Object.assign(hoverStyles, {
          color: theme.palette.common.white,
          backgroundColor: theme.palette.blue["70"],
        });
      }

      return {
        ...baseStyles,
        "&:before": beforeStyles,
        ":hover": hoverStyles,
        ":active": activeStyles,
        "&.Mui-disabled": disabledStyles,
        ":focus-visible:after": focusVisibleAfterStyles,
        ":focus": focusStyles,
      };
    },
    endIcon: {
      "&>*:nth-of-type(1)": {
        fontSize: "inherit",
      },
    },
    startIcon: {
      "&>*:nth-of-type(1)": {
        fontSize: "inherit",
      },
    },
  },
};
