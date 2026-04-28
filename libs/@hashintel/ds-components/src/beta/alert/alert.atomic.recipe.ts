import { sva } from "@hashintel/ds-helpers/css";

export const alert = sva({
  slots: ["root", "content", "description", "indicator", "title"],
  base: {
    root: {
      alignItems: "flex-start",
      borderRadius: "md",
      display: "flex",
      position: "relative",
      width: "full",
    },
    content: {
      display: "flex",
      flex: "1",
      flexDirection: "column",
      gap: "1",
    },
    description: {
      display: "inline",
    },
    indicator: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: "0",
    },
    title: {
      fontWeight: "semibold",
    },
  },
  defaultVariants: {
    size: "md",
    status: "info",
    variant: "subtle",
  },
  variants: {
    size: {
      md: {
        root: {
          gap: "3",
          p: "4",
          textStyle: "sm",
        },
        indicator: {
          _icon: {
            width: "5",
            height: "5",
          },
        },
      },
      lg: {
        root: {
          gap: "4",
          p: "4",
          textStyle: "lg",
        },
        indicator: {
          _icon: {
            width: "6",
            height: "6",
          },
        },
      },
    },
    variant: {
      solid: {
        root: {
          // bg: "colorPalette.solid.bg",
          // color: "colorPalette.fg.max",
        },
        title: { color: "colorPalette.s55" },
      },
      surface: {
        root: {
          // bg: "colorPalette.surface.bg",
          borderWidth: "1px",
          borderColor: "colorPalette.bd.strong",
          // color: "colorPalette.surface.fg",
        },
      },
      subtle: {
        root: {
          // bg: "colorPalette.subtle.bg",
          // color: "colorPalette.subtle.fg",
        },
      },
      outline: {
        root: {
          borderWidth: "1px",
          // borderColor: "colorPalette.outline.border",
          // color: "colorPalette.outline.fg",
        },
      },
    },
    status: {
      info: {
        root: { colorPalette: "blue" },
      },
      warning: {
        root: { colorPalette: "orange" },
      },
      success: {
        root: { colorPalette: "green" },
      },
      error: {
        root: { colorPalette: "red" },
      },
      neutral: {},
    },
  },
});
