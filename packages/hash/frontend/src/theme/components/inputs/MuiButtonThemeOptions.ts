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

      if (variant === "primary") {
        /** ===== PRIMARY button specific styling ===== */

        Object.assign(baseStyles, {
          color: theme.palette.common.white,
          background: theme.palette.blue[70],
          backgroundColor: theme.palette.blue[70],
          position: "relative",
          overflow: "hidden",
          zIndex: 0,
          transition: "opacity 0.5s ease-in-out",
          ...(size === "small" && {
            padding: theme.spacing("8px", "20px"),
          }),
          ...(size === "medium" && {
            padding: theme.spacing("12px", "28px"),
            minHeight: 51,
          }),
        });

        Object.assign(beforeStyles, {
          position: "absolute",
          top: 0,
          width: "100%",
          height: "100%",
          opacity: 0,
          background:
            "linear-gradient(82.89deg, #9E56FA 5.64%, #644CFF 78.19%, #0070F4 121.05%)",
          zIndex: -1,
        });

        Object.assign(hoverBeforeStyles, {
          opacity: 1,
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
