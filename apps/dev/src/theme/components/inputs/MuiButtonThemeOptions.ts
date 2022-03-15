/**
 * @todo update from blockprotocol
 */
import { Components, CSSObject, Theme } from "@mui/material";

const buttonFocusBorderOffset = 6;
const buttonFocusBorderWidth = 2;

// @todo focus border radius needs fixing
export const MuiButtonThemeOptions: Components<Theme>["MuiButton"] = {
  defaultProps: {
    variant: "primary",
    color: "default",
    disableElevation: true,
    disableRipple: true,
    disableTouchRipple: true,
  },
  styleOverrides: {
    root: ({ ownerState, theme }) => {
      const { variant, size } = ownerState;

      if (variant === "primarySquare" && size !== "large") {
        throw new Error("primarySquare buttons must be large");
      }

      const { typography } = theme;

      const baseStyles: CSSObject = {
        textTransform: "none",
        lineHeight: 1,
        border: "2px solid",
        position: "relative",
      };

      const hoverStyles: CSSObject = {};

      // @todo set these
      const disabledStyles: CSSObject = {
        backgroundColor: theme.palette.gray[20],
        borderColor: theme.palette.gray[20],
        color: theme.palette.gray[50],
      };

      const afterStyles = {
        content: `""`,
        position: "absolute",
        left: -buttonFocusBorderOffset,
        top: -buttonFocusBorderOffset,
        bottom: -buttonFocusBorderOffset,
        right: -buttonFocusBorderOffset,
        border: `${buttonFocusBorderWidth}px solid transparent`,
        transition: theme.transitions.create("border-color"),
      };

      const focusVisibleAfterStyles: CSSObject = {
        borderColor: "initial",
      };

      switch (size) {
        case "large": {
          if (variant === "primarySquare") {
            // @todo use palette colour
            const boxShadow = "inset 0px -2px 6px rgba(231, 162, 89, 0.5)";
            const borderRadius = 4;

            Object.assign(baseStyles, {
              borderRadius,
              borderWidth: 1,
              borderColor: theme.palette.orange[400],
              color: theme.palette.gray[90],
              backgroundColor: theme.palette.white,
              padding: theme.spacing("24px", "31px"),
              fontSize: typography.bpBodyCopy.fontSize,
              fontWeight: 400,
              boxShadow,
              minHeight: 72,
            });
            Object.assign(hoverStyles, {
              backgroundColor: theme.palette.yellow[100],
              color: theme.palette.black,
              boxShadow,
            });
            Object.assign(afterStyles, {
              borderRadius:
                borderRadius + buttonFocusBorderOffset + buttonFocusBorderWidth,
            });
            Object.assign(focusVisibleAfterStyles, {
              borderColor: theme.palette.yellow[800],
            });
          } else {
            const borderRadius = 29;
            Object.assign(baseStyles, {
              fontSize: typography.bpBodyCopy.fontSize,
              borderRadius,
              minHeight: 54,
              padding: theme.spacing("14px", "37.5px"),
            });
            Object.assign(afterStyles, {
              borderRadius:
                borderRadius + buttonFocusBorderOffset + buttonFocusBorderWidth,
            });
          }

          break;
        }
        case "medium": {
          const borderRadius = 22;
          Object.assign(baseStyles, {
            fontSize: typography.bpSmallCopy.fontSize,
            borderRadius,
            minHeight: 42,
            padding: theme.spacing("10px", "18px"),
          });
          Object.assign(afterStyles, {
            borderRadius:
              borderRadius + buttonFocusBorderOffset + buttonFocusBorderWidth,
          });
          break;
        }
      }
      switch (variant) {
        case "primary": {
          /** ===== PRIMARY button specific styling ===== */
          Object.assign(baseStyles, {
            fontWeight: 600,
            color: theme.palette.orange[800],
            backgroundColor: theme.palette.yellow[300],
            borderColor: size === "large" ? theme.palette.white : "transparent",
          });
          Object.assign(hoverStyles, {
            color: theme.palette.orange[900],
            backgroundColor: theme.palette.yellow[300],
            borderColor: theme.palette.yellow[500],
          });
          Object.assign(focusVisibleAfterStyles, {
            borderColor: theme.palette.yellow[800],
          });
          break;
        }
        case "secondary": {
          Object.assign(baseStyles, {
            fontWeight: 600,
            color: theme.palette.orange[800],
            backgroundColor: theme.palette.white,
            borderColor: theme.palette.yellow[300],
          });
          Object.assign(hoverStyles, {
            color: theme.palette.orange[900],
            backgroundColor: theme.palette.yellow[100],
            borderColor: theme.palette.yellow[400],
          });
          Object.assign(focusVisibleAfterStyles, {
            borderColor: theme.palette.yellow[800],
          });
          break;
        }
        case "tertiary": {
          Object.assign(baseStyles, {
            fontWeight: 500,
            color: theme.palette.gray[70],
            backgroundColor: theme.palette.gray[10],
            borderColor: "transparent",
          });
          Object.assign(hoverStyles, {
            color: theme.palette.gray[80],
            backgroundColor: theme.palette.gray[20],
          });
          Object.assign(focusVisibleAfterStyles, {
            borderColor: theme.palette.yellow[800],
          });
          break;
        }
      }

      /* else if (variant === "secondary") {
        /** ===== SECONDARY button specific styling ===== * /

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
        /** ===== TERTIARY button specific styling ===== * /

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
        /** ===== TRANSPARENT button specific styling ===== * /

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
      } */

      return {
        ...baseStyles,
        ":hover": hoverStyles,
        ":focus-visible": hoverStyles,
        ":disabled": disabledStyles,
        ":after": afterStyles,
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
