import { buttonClasses, Components, CSSObject, Theme } from "@mui/material";

const buttonFocusBorderOffset = { md: 4, lg: 6 };
const buttonFocusBorderWidth = { md: 2, lg: 3 };
const buttonBorderRadius = { md: 4, lg: 6 };

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

      /** ====================== INITIAL Button styles ============================= */

      // base CSS styling applied to the button
      let baseStyles: CSSObject = {
        textTransform: "none",

        [`& > .${buttonClasses.startIcon}, & > .${buttonClasses.endIcon}`]: {
          color: "currentColor",
        },
      };

      // :before CSS styling applied to the button
      let beforeStyles: CSSObject = {
        content: `""`,
        borderRadius: "inherit",
        position: "absolute",
        width: "100%",
        height: "100%",
      };

      // :hover CSS styling applied to the button
      let hoverStyles: CSSObject = {};

      // :hover:before CSS styling applied to the button
      let hoverBeforeStyles: CSSObject = {};

      // .Mui-disabled CSS styling applied to the button
      const disabledStyles: CSSObject = {
        background: theme.palette.gray[20],
        color: theme.palette.gray[50],
      };

      // The :active CSS styling applied to the button
      const activeStyles: CSSObject = {};

      // The :focus CSS styling applied to the button
      const focusStyles: CSSObject = { outline: "none" };

      const focusBorderOffset =
        buttonFocusBorderOffset[variant === "primary" ? "lg" : "md"];

      const focusBorderWidth =
        buttonFocusBorderWidth[variant === "primary" ? "lg" : "md"];

      // The :focus-visible:after CSS styling applied to the button
      const focusVisibleAfterStyles: CSSObject = {
        content: `""`,
        position: "absolute",
        left: -focusBorderOffset,
        top: -focusBorderOffset,
        bottom: -focusBorderOffset,
        right: -focusBorderOffset,
        border: `${focusBorderWidth}px solid`,
        borderRadius:
          buttonBorderRadius[size === "large" ? "lg" : "md"] +
          focusBorderOffset,
        borderColor: theme.palette.blue["70"],
      };

      /** ====================== VARIANTS specific styling ============================= */

      if (variant === "primary") {
        /** ===== PRIMARY variant specific styling ===== */
        baseStyles = {
          ...baseStyles,
          color: theme.palette.common.white,
          background: theme.palette.blue[70],
          position: "relative",
          zIndex: 0,
          transition: theme.transitions.create("opacity"),
        };

        beforeStyles = {
          ...beforeStyles,
          position: "absolute",
          top: 0,
          width: "100%",
          height: "100%",
          opacity: 0,
          background:
            "linear-gradient(82.89deg, #9E56FA 5.64%, #644CFF 78.19%, #0070F4 121.05%)",
          boxShadow: theme.boxShadows.purpleShadowMd,
          transition: theme.transitions.create("opacity"),
          zIndex: -1,
        };

        hoverStyles = {
          ...hoverStyles,
          background: theme.palette.blue[70],
        };

        hoverBeforeStyles = {
          ...hoverBeforeStyles,
          opacity: 1,
        };
      } else if (variant === "secondary") {
        baseStyles = {
          ...baseStyles,
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: theme.palette.blue[70],
          color: theme.palette.blue[70],
          background: theme.palette.common.white,
        };

        hoverStyles = {
          ...hoverStyles,
          background: theme.palette.blue[20],
        };
      } else if (variant === "tertiary") {
        /** ===== TERTIARY variant specific styling ===== */
        baseStyles = {
          ...baseStyles,
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: theme.palette.gray[30],
          color: theme.palette.gray[80],
          background: theme.palette.common.white,

          [`& > .${buttonClasses.startIcon}, & > .${buttonClasses.endIcon}`]: {
            color: theme.palette.gray[50],
          },
        };

        hoverStyles = {
          ...hoverStyles,
          background: theme.palette.gray[20],
          color: theme.palette.gray[90],

          [`& > .${buttonClasses.startIcon}, & > .${buttonClasses.endIcon}`]: {
            color: theme.palette.gray[80],
          },
        };
      } else if (variant === "tertiary_quiet") {
        /** ===== TERTIARY QUIET variant specific styling ===== */
        baseStyles = {
          ...baseStyles,
          border: `1px solid transparent`,
          color: theme.palette.gray[70],
          background: theme.palette.common.white,

          [`& > .${buttonClasses.startIcon}, & > .${buttonClasses.endIcon}`]: {
            color: theme.palette.gray[50],
          },
        };

        hoverStyles = {
          ...hoverStyles,
          background: theme.palette.gray[20],
          color: theme.palette.gray[80],

          [`& > .${buttonClasses.startIcon}, & > .${buttonClasses.endIcon}`]: {
            color: theme.palette.gray[80],
          },
        };
      } else if (variant === "warning") {
        /** ===== WARNING variant specific styling ===== */
        baseStyles = {
          ...baseStyles,
          color: theme.palette.orange[90],
          background: theme.palette.orange[40],
        };

        hoverStyles = {
          ...hoverStyles,
          background: theme.palette.orange[50],
          color: theme.palette.orange[100],
        };
      } else if (variant === "danger") {
        /** ===== DANGER variant specific styling ===== */
        baseStyles = {
          ...baseStyles,
          color: theme.palette.common.white,
          background: theme.palette.red[60],
        };

        hoverStyles = {
          ...hoverStyles,
          background: theme.palette.red[70],
        };
      }

      /** ====================== SIZE specific styling ============================= */

      baseStyles = {
        ...baseStyles,
        borderRadius: `${buttonBorderRadius.md}px`,
        ...(size === "large" && {
          padding: "16px 32px",
          minHeight: 56,
          minWidth: 120,
          borderRadius: `${buttonBorderRadius.lg}px`,
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
        ...(["tertiary", "tertiary_quiet"].includes(variant ?? "primary") && {
          fontWeight: 500,
        }),
      };

      return {
        ...baseStyles,
        "&:before": beforeStyles,
        ":hover": hoverStyles,
        "&:hover:before": hoverBeforeStyles,
        ":active": activeStyles,
        "&.Mui-disabled": disabledStyles,
        ":focus": focusStyles,
        ":focus-visible:after": focusVisibleAfterStyles,
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
