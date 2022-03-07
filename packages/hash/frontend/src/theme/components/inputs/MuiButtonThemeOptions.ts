import { Components, CSSObject, Theme } from "@mui/material";

const buttonFocusBorderOffset = 4;
const buttonFocusBorderWidth = 3;

export const MuiButtonThemeOptions: Components<Theme>["MuiButton"] = {
  defaultProps: {
    variant: "primary",
    size: "medium",
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

      /** ===== VARIANTS specific styling ===== */

      if (variant === "primary") {
        /** ===== PRIMARY button specific styling ===== */

        Object.assign(baseStyles, {
          color: theme.palette.common.white,
          background: theme.palette.blue[70],
          position: "relative",
          zIndex: 0,
          transition: "opacity 0.3s ease-in-out",
        });

        Object.assign(beforeStyles, {
          position: "absolute",
          top: 0,
          width: "100%",
          height: "100%",
          opacity: 0,
          background:
            "linear-gradient(82.89deg, #9E56FA 5.64%, #644CFF 78.19%, #0070F4 121.05%)",
          boxShadow: theme.boxShadows.purpleShadowMd,
          zIndex: -1,
        });

        Object.assign(hoverBeforeStyles, {
          opacity: 1,
        });
      } else if (variant === "secondary") {
        Object.assign(baseStyles, {
          border: `1px solid ${theme.palette.blue[70]}`,
          color: theme.palette.blue[70],
          background: theme.palette.common.white,
        });

        Object.assign(hoverStyles, {
          background: theme.palette.blue[20],
        });
      } else if (variant === "tertiary_quiet") {
        /** ===== TERTIARY button specific styling ===== */

        Object.assign(baseStyles, {
          color: theme.palette.gray[70],
          fontWeight: 500,
          background: theme.palette.common.white,
          "& > .MuiButton-startIcon, > .MuiButton-endIcon": {
            color: theme.palette.gray[40],
          },
        });

        Object.assign(hoverStyles, {
          color: theme.palette.gray[80],
        });

        Object.assign(activeStyles, {
          background: theme.palette.gray[20],
        });
      }

      /** ===== SIZES specific styling ===== */
      // @todo-mui note that tertiary_quiet has different font-weight
      const sizeStyles = {
        borderRadius: "4px",
        ...(size === "large" && {
          padding: "16px 32px",
          minHeight: 56,
          minWidth: 120,
          borderRadius: "6px",
          ...theme.typography.largeTextLabels,
        }),
        ...(size === "medium" && {
          padding: "12px 20px",
          minHeight: 48,
          minWidth: 104,
          ...theme.typography.regularTextLabels,
        }),
        ...(size === "small" && {
          padding: "12px 20px",
          minHeight: 42,
          minWidth: 78,
          ...theme.typography.smallTextLabels,
        }),
        ...(size === "xs" && {
          padding: "8px 16px",
          minHeight: 34,
          minWidth: 52,
          ...theme.typography.smallTextLabels,
        }),
        fontWeight: 600,
        ...(["tertiary", "tertiary_quiet"].includes(variant || "primary") && {
          fontWeight: 500,
        }),
      };

      return {
        ...baseStyles,
        ...sizeStyles,
        "&:before": beforeStyles,
        ":hover": hoverStyles,
        "&:hover:before": hoverBeforeStyles,
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
