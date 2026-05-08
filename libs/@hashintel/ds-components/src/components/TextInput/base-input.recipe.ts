import { sva } from "@hashintel/ds-helpers/css";

export const baseInputRecipe = sva({
  slots: [
    "root",
    "inputWrapper",
    "input",
    "hiddenInput",
    "adornment",
    "adornmentButton",
    "adornmentText",
    "styledValueOverlay",
    "readonly",
  ],
  base: {
    root: {
      display: "inline-flex",
      alignItems: "center",
      position: "relative",
      transition: "colors",
      _focusWithin: {
        outline: "[2px solid]",
        outlineColor: "colorPalette.bd.solid",
        outlineOffset: "[-1px]",
      },
    },
    readonly: {
      display: "inline-flex",
      alignItems: "center",
      color: "fg.body",
    },
    inputWrapper: {
      position: "relative",
      display: "flex",
      flex: "1",
      minWidth: "0",
      alignItems: "center",
      borderRadius: "[inherit]",
    },
    input: {
      flex: "1",
      minWidth: "0",
      width: "[100%]",
      padding: "0",
      appearance: "none",
      outline: "0",
      border: "none",
      bg: "[inherit]",
      color: "[inherit]",
      borderRadius: "[inherit]",
      _placeholder: { color: "fg.muted" },
      _disabled: { cursor: "not-allowed" },
    },
    hiddenInput: {
      color: "[transparent]",
      caretColor: "[transparent]",
    },
    adornment: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      color: "fg.muted",
    },
    adornmentButton: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      cursor: "pointer",
      bg: "[transparent]",
      borderWidth: "0",
      padding: "0",
      color: "fg.muted",
      _hover: { color: "fg.heading" },
    },
    adornmentText: {
      whiteSpace: "nowrap",
    },
    styledValueOverlay: {
      position: "absolute",
      inset: "0",
      display: "flex",
      alignItems: "center",
      pointerEvents: "none",
      overflow: "hidden",
    },
  },
  variants: {
    variant: {
      default: {
        root: {
          borderWidth: "1px",
          borderColor: "bd.solid",
          color: "fg.body",
          bg: "white",
          _hover: {
            borderColor: "neutral.s80",
            bg: "neutral.s10",
          },
        },
      },
      subtle: {
        root: {
          borderWidth: "1px",
          borderColor: "[transparent]",
        },
      },
    },
    size: {
      xs: {
        input: {
          paddingX: "2",
          paddingY: "0",
          textStyle: "xs",
        },
        root: {
          gap: "1.5",
          borderRadius: "md",
        },
      },
      sm: {
        input: {
          paddingX: "2.5",
          paddingY: "0.5",
          textStyle: "sm",
        },
        root: {
          gap: "1.5",
          borderRadius: "lg",
        },
      },
      md: {
        input: {
          paddingX: "3",
          paddingY: "1",
          textStyle: "base",
        },
        root: {
          gap: "2",
          borderRadius: "lg",
        },
      },
      lg: {
        input: {
          paddingX: "4",
          paddingY: "2",
          textStyle: "base",
        },
        root: {
          gap: "2",
          borderRadius: "xl",
        },
      },
    },
    invalid: {
      true: {
        root: {
          borderColor: "status.error.bd.solid",
          _focusVisibleWithin: {
            outlineColor: "status.error.bd.solid",
          },
        },
      },
    },
    disabled: {
      true: {
        root: {
          layerStyle: "disabled",
          cursor: "not-allowed",
        },
      },
    },
    width: {
      sm: {
        root: { width: "[12rem]" },
        readonly: { width: "[12rem]" },
      },
      md: {
        root: { width: "[20rem]" },
        readonly: { width: "[20rem]" },
      },
      lg: {
        root: { width: "[30rem]" },
        readonly: { width: "[30rem]" },
      },
      fullWidth: {
        root: { width: "full" },
        readonly: { width: "full" },
      },
      fitContent: {
        root: { width: "[fit-content]" },
        readonly: { width: "[fit-content]" },
      },
    },
    align: {
      left: { input: { textAlign: "start" } },
      center: { input: { textAlign: "center" } },
      right: { input: { textAlign: "end" } },
    },
  },
  defaultVariants: {
    variant: "default",
    size: "md",
    align: "left",
  },
});
