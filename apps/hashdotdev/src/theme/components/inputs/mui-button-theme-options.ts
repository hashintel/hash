import type { Components, CSSObject, Theme } from "@mui/material";
import { buttonClasses } from "@mui/material";

const buttonFocusBorderOffset = 6;
const buttonFocusBorderWidth = 2;

const focusPositionStyles = (borderOffset: number): CSSObject => ({
  left: -borderOffset,
  top: -borderOffset,
  bottom: -borderOffset,
  right: -borderOffset,
});

const focusBorderStyles = (borderWidth: number): CSSObject => ({
  border: `${borderWidth}px solid transparent`,
});

const focusStyles = (borderWidth: number, borderOffset: number): CSSObject => ({
  ...focusPositionStyles(borderOffset),
  ...focusBorderStyles(borderWidth),
});

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
      const { variant, size, color } = ownerState;

      if (
        variant === "primarySquare" &&
        size !== "large" &&
        size !== "medium"
      ) {
        throw new Error("primarySquare buttons must be large or medium");
      }

      const { typography } = theme;

      const baseStyles: CSSObject = {
        textTransform: "none",
        lineHeight: 1,
        border: "1px solid",
        position: "relative",
        whiteSpace: "nowrap",

        // Makes this always correct as a pill shape
        borderRadius: 999,
      };

      const hoverStyles: CSSObject = {};

      const disabledStyles: CSSObject = {
        backgroundColor: theme.palette.gray[20],
        borderColor: theme.palette.gray[20],
        color: theme.palette.gray[50],
      };

      const afterStyles: CSSObject = {
        content: `""`,
        position: "absolute",
        ...focusBorderStyles(buttonFocusBorderWidth),
        ...focusPositionStyles(buttonFocusBorderOffset),
        transition: theme.transitions.create("border-color"),

        // Makes this always correct as a pill shape
        borderRadius: 999,
      };

      const focusVisibleStyles: CSSObject = {};

      const focusVisibleAfterStyles: CSSObject = {
        borderColor:
          color === "purple"
            ? theme.palette.purple[80]
            : theme.palette.yellow[800],
      };

      if (variant === "primarySquare") {
        const boxShadow = `inset 0px -2px 6px rgba(158, 217, 233, 0.20)`;

        Object.assign(baseStyles, {
          borderRadius: 4,
          borderWidth: 1,
          borderColor:
            color === "purple"
              ? theme.palette.purple[40]
              : color === "blue"
                ? theme.palette.blue[40]
                : color === "green"
                  ? theme.palette.green[40]
                  : theme.palette.teal[40],
          color: theme.palette.gray[90],
          backgroundColor: theme.palette.white,
          padding: theme.spacing("24px", "31px"),
          fontWeight: 400,
          boxShadow,
          minHeight: 72,
        });
        Object.assign(hoverStyles, {
          backgroundColor:
            color === "purple"
              ? theme.palette.purple[10]
              : color === "blue"
                ? theme.palette.blue[10]
                : color === "green"
                  ? theme.palette.green[10]
                  : theme.palette.teal[10],
          color: theme.palette.black,
          boxShadow,
        });
        Object.assign(focusVisibleStyles, {
          boxShadow: "none",
        });
        Object.assign(afterStyles, {
          ...focusStyles(3, 7),
          borderRadius: 10,
        });
      }

      switch (size) {
        case "large": {
          Object.assign(baseStyles, {
            fontSize: typography.hashBodyCopy.fontSize,
          });

          if (variant === "primarySquare") {
            Object.assign(baseStyles, {
              padding: theme.spacing("24px", "31px"),
            });
          } else {
            Object.assign(baseStyles, {
              minHeight: 54,
              padding: theme.spacing("14px", "37.5px"),
            });
            Object.assign(afterStyles, {
              ...focusStyles(buttonFocusBorderWidth, buttonFocusBorderOffset),
            });
          }

          break;
        }
        case "medium": {
          Object.assign(baseStyles, {
            fontSize: typography.hashSmallText.fontSize,
            minHeight: variant === "tertiary" ? 33 : 42,
            padding:
              variant === "primarySquare"
                ? theme.spacing(1.75, 4)
                : variant === "tertiary"
                  ? theme.spacing("6px", "16px")
                  : theme.spacing("10px", "18px"),
          });
          Object.assign(afterStyles, {
            ...focusStyles(buttonFocusBorderWidth, buttonFocusBorderOffset),
          });
          break;
        }
      }
      switch (variant) {
        case "primary": {
          Object.assign(baseStyles, {
            fontWeight: 600,
            color:
              color === "purple"
                ? theme.palette.purple[80]
                : color === "blue"
                  ? theme.palette.blue[80]
                  : theme.palette.teal[80],
            backgroundColor:
              color === "purple"
                ? theme.palette.purple[20]
                : color === "blue"
                  ? theme.palette.blue[15]
                  : theme.palette.teal[30],
            borderColor: size === "large" ? theme.palette.white : "transparent",
          });
          Object.assign(hoverStyles, {
            color:
              color === "purple"
                ? theme.palette.purple[90]
                : color === "blue"
                  ? theme.palette.blue[90]
                  : theme.palette.teal[90],
            backgroundColor:
              color === "purple"
                ? theme.palette.purple[20]
                : color === "blue"
                  ? theme.palette.blue[20]
                  : theme.palette.teal[20],
            borderColor:
              color === "purple"
                ? theme.palette.purple[50]
                : color === "blue"
                  ? theme.palette.blue[50]
                  : theme.palette.teal[50],
          });
          break;
        }
        case "secondary": {
          Object.assign(baseStyles, {
            fontWeight: 600,
            color:
              color === "purple"
                ? theme.palette.purple[80]
                : theme.palette.blue[80],
            backgroundColor: theme.palette.white,
            borderColor:
              color === "purple"
                ? theme.palette.purple[20]
                : theme.palette.blue[20],
          });
          Object.assign(hoverStyles, {
            color:
              color === "purple"
                ? theme.palette.purple[90]
                : theme.palette.blue[90],
            backgroundColor:
              color === "purple"
                ? theme.palette.purple[10]
                : theme.palette.blue[10],
            borderColor:
              color === "purple"
                ? theme.palette.purple[40]
                : theme.palette.blue[40],
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
          break;
        }
      }

      return {
        ...baseStyles,
        ":hover, &.Button--hover:not(:disabled)": hoverStyles,
        ":focus-visible, &.Button--focus:not(:disabled)": {
          ...hoverStyles,
          ...focusVisibleStyles,
        },
        ":disabled": disabledStyles,
        ":after": afterStyles,
        ":focus-visible:after, &.Button--focus:not(:disabled):after":
          focusVisibleAfterStyles,

        [`.${buttonClasses.startIcon}, .${buttonClasses.endIcon}`]: {
          "&>*:nth-of-type(1)": {
            fontSize: 12,
            marginTop: 1,
            ...(ownerState.variant === "primary" && {
              color:
                color === "purple"
                  ? theme.palette.purple[50]
                  : color === "blue"
                    ? theme.palette.blue[40]
                    : theme.palette.teal[50],
            }),
            ...(ownerState.variant === "secondary" && {
              color:
                color === "purple"
                  ? theme.palette.purple[40]
                  : color === "blue"
                    ? theme.palette.blue[40]
                    : theme.palette.teal[30],
            }),
            ...(ownerState.variant === "primarySquare" && {
              fontSize: 24,
              color:
                color === "purple"
                  ? theme.palette.purple[50]
                  : color === "blue"
                    ? theme.palette.blue[50]
                    : color === "green"
                      ? theme.palette.green[70]
                      : theme.palette.teal[60],
            }),
            ...(ownerState.variant === "tertiary" && {
              color: theme.palette.gray[50],
            }),
          },
        },
        "&:hover": {
          [`.${buttonClasses.startIcon}, .${buttonClasses.endIcon}`]: {
            "&>*:nth-of-type(1)": {
              ...(ownerState.variant === "primary" && {
                color:
                  color === "purple"
                    ? theme.palette.purple[90]
                    : color === "blue"
                      ? theme.palette.blue[90]
                      : theme.palette.teal[90],
              }),
              ...(ownerState.variant === "secondary" && {
                color:
                  color === "purple"
                    ? theme.palette.purple[50]
                    : color === "blue"
                      ? theme.palette.blue[90]
                      : theme.palette.teal[50],
              }),
              ...(ownerState.variant === "tertiary" && {
                color: theme.palette.gray[70],
              }),
            },
          },
        },
        [`.${buttonClasses.endIcon}`]: {
          marginRight: 0,
          marginLeft: theme.spacing(
            ownerState.variant === "primarySquare" ? 2 : 1,
          ),
        },
        [`.${buttonClasses.startIcon}`]: {
          marginLeft: 0,
          marginRight: theme.spacing(
            ownerState.variant === "primarySquare" ? 2 : 1,
          ),
        },
      };
    },
  },
};
