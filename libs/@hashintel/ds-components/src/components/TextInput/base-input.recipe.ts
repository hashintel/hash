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
      borderRadius: "lg",
      position: "relative",
      transition: "colors",
      color: "fg.body",
      _focusVisibleWithin: {
        outline: "[2px solid]",
        outlineColor: "colorPalette.bd.solid",
        outlineOffset: "[-1px]",
      },
    },
    inputWrapper: {
      position: "relative",
      flex: "1",
      minWidth: "0",
      display: "flex",
      alignItems: "center",
    },
    input: {
      flex: "1",
      minWidth: "0",
      appearance: "none",
      outline: "0",
      borderWidth: "0",
      bg: "[transparent]",
      color: "[inherit]",
      fontFamily: "[inherit]",
      fontSize: "[inherit]",
      lineHeight: "[inherit]",
      letterSpacing: "[inherit]",
      padding: "0",
      width: "full",
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
    readonly: {
      display: "inline-flex",
      alignItems: "center",
      color: "fg.body",
    },
  },
  variants: {
    variant: {
      default: {
        root: {
          borderWidth: "1px",
          borderColor: "bd.solid",
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
      xs: { root: { height: "8", textStyle: "sm", px: "2", gap: "1.5" } },
      sm: { root: { height: "9", textStyle: "sm", px: "2.5", gap: "1.5" } },
      md: { root: { height: "10", textStyle: "base", px: "3", gap: "2" } },
      lg: { root: { height: "11", textStyle: "base", px: "3.5", gap: "2" } },
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
