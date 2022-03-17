import { Components, CSSObject, Theme } from "@mui/material";

const buttonFocusBorderOffset = 6;
const buttonFocusBorderWidth = 2;

const focusPositionStyles = (borderOffset: number): CSSObject => ({
  left: -borderOffset,
  top: -borderOffset,
  bottom: -borderOffset,
  right: -borderOffset,
});

const focusBorderRadiusStyles = (
  borderRadius: number,
  borderOffset: number,
  borderWidth: number,
): CSSObject => ({
  borderRadius: borderRadius + (borderOffset - borderWidth),
});

const focusBorderStyles = (borderWidth: number): CSSObject => ({
  border: `${borderWidth}px solid transparent`,
});

const focusStyles = (
  borderWidth: number,
  borderOffset: number,
  borderRadius: number,
): CSSObject => ({
  ...focusPositionStyles(borderOffset),
  ...focusBorderStyles(borderWidth),
  ...focusBorderRadiusStyles(borderRadius, borderOffset, borderWidth),
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
      };

      const focusVisibleStyles: CSSObject = {};

      const focusVisibleAfterStyles: CSSObject = {
        borderColor: theme.palette.yellow[800],
      };

      switch (size) {
        case "large": {
          Object.assign(baseStyles, {
            fontSize: typography.bpBodyCopy.fontSize,
          });

          if (variant === "primarySquare") {
            const boxShadow = `inset 0px -2px 6px ${theme.palette.yellow["500-50%"]}`;
            const borderRadius = 4;

            Object.assign(baseStyles, {
              borderRadius,
              borderWidth: 1,
              borderColor: theme.palette.orange[400],
              color: theme.palette.gray[90],
              backgroundColor: theme.palette.white,
              padding: theme.spacing("24px", "31px"),
              fontWeight: 400,
              boxShadow,
              minHeight: 72,
            });
            Object.assign(hoverStyles, {
              backgroundColor: theme.palette.yellow[100],
              color: theme.palette.black,
              boxShadow,
            });
            Object.assign(focusVisibleStyles, {
              boxShadow: "none",
            });
            Object.assign(afterStyles, {
              ...focusStyles(3, 7, borderRadius + 2),
            });
          } else {
            const borderRadius = 29;
            Object.assign(baseStyles, {
              borderRadius,
              minHeight: 54,
              padding: theme.spacing("14px", "37.5px"),
            });
            Object.assign(afterStyles, {
              ...focusStyles(
                buttonFocusBorderWidth,
                buttonFocusBorderOffset,
                borderRadius,
              ),
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
            ...focusStyles(
              buttonFocusBorderWidth,
              buttonFocusBorderOffset,
              borderRadius,
            ),
          });
          break;
        }
      }
      switch (variant) {
        case "primary": {
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
