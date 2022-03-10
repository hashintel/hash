/**
 * @todo update from blockprotocol
 */
import { Components, CSSObject, Theme } from "@mui/material";

const buttonBorderRadius = 34;
const buttonFocusBorderOffset = 6;
const buttonFocusBorderWidth = 4;

export const MuiButtonThemeOptions: Components<Theme>["MuiButton"] = {
  defaultProps: {
    variant: "primary",
    color: "purple",
    disableElevation: true,
    disableRipple: true,
    disableTouchRipple: true,
  },
  styleOverrides: {
    root: ({ ownerState, theme }) => {
      const { variant, color, size } = ownerState;

      const { typography } = theme;

      // The base CSS styling applied to the button
      const baseStyles: CSSObject = {
        textTransform: "none",
        fontSize:
          size === "small"
            ? typography.bpSmallCopy.fontSize
            : size === "medium"
            ? typography.bpBodyCopy.fontSize
            : undefined,
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
      };

      if (variant === "primary") {
        /** ===== PRIMARY button specific styling ===== */

        Object.assign(baseStyles, {
          color: theme.palette.gray[20],
          borderRadius: buttonBorderRadius,
          ...(size === "small" && {
            padding: theme.spacing("8px", "20px"),
            minHeight: 40,
          }),
          ...(size === "medium" && {
            padding: theme.spacing("12px", "28px"),
            minHeight: 51,
          }),
          ...(color &&
            {
              purple: {
                zIndex: 0,
                background: theme.palette.purple[600],
              },
              teal: { backgroundColor: theme.palette.teal[500] },
              gray: {
                color: theme.palette.gray[90],
                backgroundColor: theme.palette.gray[50],
              },
              warning: { backgroundColor: theme.palette.orange[500] },
              danger: { backgroundColor: theme.palette.red[600] },
              inherit: {},
            }[color]),
        });
        Object.assign(beforeStyles, {
          ...(color === "purple" && {
            zIndex: -1,
            opacity: 0,
            transition: theme.transitions.create("opacity"),
            background: `radial-gradient(57.38% 212.75% at 50.1% 134.31%, ${theme.palette.teal["400"]} 0%, ${theme.palette.purple[600]} 100%)`,
          }),
        });
        Object.assign(hoverStyles, {
          ...(color &&
            {
              purple: {
                background: theme.palette.purple[600],
                ":before": {
                  opacity: 1,
                },
              },
              teal: { backgroundColor: theme.palette.teal[600] },
              gray: { backgroundColor: theme.palette.gray[30] },
              warning: { backgroundColor: theme.palette.orange[600] },
              danger: { backgroundColor: theme.palette.red[700] },
              inherit: {},
            }[color]),
        });
        Object.assign(disabledStyles, {
          ...(color === "purple" && {
            background: theme.palette.purple[200],
            color: theme.palette.purple[100],
          }),
        });
        Object.assign(focusVisibleAfterStyles, {
          borderRadius: buttonBorderRadius + buttonFocusBorderOffset,
          ...(color &&
            {
              purple: { borderColor: theme.palette.purple[600] },
              teal: { borderColor: theme.palette.teal[500] },
              gray: { borderColor: theme.palette.gray[50] },
              warning: { borderColor: theme.palette.orange[500] },
              danger: { borderColor: theme.palette.red[700] },
              inherit: {},
            }[color]),
        });
      } else if (variant === "secondary") {
        /** ===== SECONDARY button specific styling ===== */

        Object.assign(baseStyles, {
          background: theme.palette.gray[10],
          borderRadius: buttonBorderRadius,
          ...(size === "small" && {
            paddingTop: `calc(${theme.spacing(0.5)} - 1px)`,
            paddingBottom: `calc(${theme.spacing(0.5)} - 1px)`,
            paddingLeft: `calc(${theme.spacing(1.5)} - 1px)`,
            paddingRight: `calc(${theme.spacing(1.5)} - 1px)`,
          }),
          ...(size === "medium" && {
            padding: theme.spacing("8px", "24px"),
            minHeight: 51,
          }),
          ...(color &&
            {
              purple: { color: theme.palette.purple[700] },
              teal: { color: theme.palette.teal[600] },
              gray: { color: theme.palette.gray[80] },
              warning: {
                color: theme.palette.orange[600],
                borderColor: "#FEB173",
                background: theme.palette.orange[100],
              },
              danger: { color: theme.palette.red[600] },
              inherit: {},
            }[color]),
        });
        Object.assign(beforeStyles, {
          borderColor: "currentColor",
        });
        Object.assign(hoverStyles, {
          ...(color &&
            {
              purple: {
                background: theme.palette.purple[200],
                color: theme.palette.purple[800],
              },
              teal: {
                background: theme.palette.teal[200],
                color: theme.palette.teal[700],
              },
              gray: {
                background: theme.palette.gray[30],
                color: theme.palette.gray[80],
              },
              warning: {
                color: theme.palette.orange[700],
                background: theme.palette.orange[200],
              },
              danger: {
                background: theme.palette.red[200],
                color: theme.palette.red[700],
              },
              inherit: {},
            }[color]),
        });
        Object.assign(focusVisibleAfterStyles, {
          borderRadius: buttonBorderRadius + buttonFocusBorderOffset,
          ...(color &&
            {
              purple: {},
              teal: { borderColor: theme.palette.teal[600] },
              gray: { borderColor: theme.palette.gray[80] },
              warning: { borderColor: theme.palette.purple[600] },
              danger: {},
              inherit: {},
            }[color]),
        });
      } else if (variant === "tertiary") {
        /** ===== TERTIARY button specific styling ===== */

        Object.assign(baseStyles, {
          borderRadius: buttonBorderRadius,
          color: theme.palette.gray[80],
          background: theme.palette.common.white,
          "& > .MuiButton-startIcon, > .MuiButton-endIcon": {
            color: theme.palette.gray[40],
          },
          ...(size === "small" && {
            paddingTop: `calc(${theme.spacing(0.5)} - 1px)`,
            paddingBottom: `calc(${theme.spacing(0.5)} - 1px)`,
            paddingLeft: `calc(${theme.spacing(1.5)} - 1px)`,
            paddingRight: `calc(${theme.spacing(1.5)} - 1px)`,
          }),
          ...(size === "medium" && {
            paddingTop: `calc(${theme.spacing(1.25)} - 1px)`,
            paddingBottom: `calc(${theme.spacing(1.25)} - 1px)`,
            paddingLeft: `calc(${theme.spacing(2.5)} - 1px)`,
            paddingRight: `calc(${theme.spacing(2.5)} - 1px)`,
          }),
          ...(color === "purple" && {
            color: theme.palette.purple[700],
            borderColor: theme.palette.purple[700],
          }),
        });
        Object.assign(beforeStyles, {
          borderColor: "#C1CFDE",
        });
        Object.assign(hoverStyles, {
          ...(color &&
            {
              purple: {
                color: theme.palette.purple[700],
                borderColor: theme.palette.purple[500],
                background: theme.palette.purple[100],
                "& > .MuiButton-startIcon, > .MuiButton-endIcon": {
                  color: theme.palette.purple[300],
                },
              },
              teal: {},
              gray: {},
              warning: {
                color: theme.palette.orange[600],
                borderColor: "#FEB173",
                background: theme.palette.orange[100],
                "& > .MuiButton-startIcon, > .MuiButton-endIcon": {
                  color: theme.palette.orange[300],
                },
              },
              danger: {},
              inherit: {},
            }[color]),
        });
        Object.assign(activeStyles, {
          ...(color &&
            {
              purple: {
                borderColor: theme.palette.purple[700],
                background: theme.palette.purple[700],
                color: theme.palette.purple[100],
                "& > .MuiButton-startIcon, > .MuiButton-endIcon": {
                  color: theme.palette.purple[100],
                },
              },
              teal: {},
              gray: {},
              warning: {},
              danger: {},
              inherit: {},
            }[color]),
        });
        Object.assign(focusVisibleAfterStyles, {
          borderRadius: buttonBorderRadius + buttonFocusBorderOffset,
        });
      } else if (variant === "transparent") {
        /** ===== TRANSPARENT button specific styling ===== */

        Object.assign(baseStyles, {
          minWidth: "unset",
          padding: "unset",
          color: theme.palette.gray[50],
        });
        Object.assign(hoverStyles, {
          color: theme.palette.purple[600],
          backgroundColor: "unset",
        });
        Object.assign(focusVisibleAfterStyles, {
          borderWidth: 1,
          bottom: 0,
          top: 0,
          borderRadius: 0,
        });
      }

      return {
        ...baseStyles,
        "&:before": beforeStyles,
        ":hover": hoverStyles,
        ":active": activeStyles,
        "&.Mui-disabled": disabledStyles,
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
