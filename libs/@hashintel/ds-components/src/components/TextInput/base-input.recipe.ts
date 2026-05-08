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
      borderWidth: "1px",
      width: "[100%]",
      _focusWithin: {
        outline: "[1px solid]",
        outlineColor: "colorPalette.bd.solid",
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
      _disabled: { cursor: "auto" },
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
          borderColor: "bd.solid",
          color: "fg.body",
          bg: "white",
          "&:not(.layer-style_disabled):hover": {
            borderColor: "neutral.s80",
            bg: "neutral.s10",
          },
        },
      },
      subtle: {
        root: {
          borderColor: "[transparent]",
          "&:not(.layer-style_disabled):hover": {
            background: "neutral.a10",
            borderColor: "neutral.a40",
          },
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
        styledValueOverlay: {
          paddingX: "2",
          paddingY: "0",
          textStyle: "xs",
        },
        readonly: {
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
        styledValueOverlay: {
          paddingX: "2.5",
          paddingY: "0.5",
          textStyle: "sm",
        },
        readonly: {
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
        styledValueOverlay: {
          paddingX: "3",
          paddingY: "1",
          textStyle: "base",
        },
        readonly: {
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
        styledValueOverlay: {
          paddingX: "4",
          paddingY: "2",
          textStyle: "base",
        },
        readonly: {
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
          "&:not(.layer-style_disabled):hover": {
            borderColor: "red.s65",
            bg: "red.s05",
          },
        },
      },
    },
    disabled: {
      true: {
        root: {
          layerStyle: "disabled",
          cursor: "auto",
        },
      },
    },
    width: {
      sm: {
        root: { maxWidth: "[10rem]" },
        readonly: { maxWidth: "[10rem]" },
      },
      md: {
        root: { maxWidth: "[18rem]" },
        readonly: { maxWidth: "[18rem]" },
      },
      lg: {
        root: { maxWidth: "[30rem]" },
        readonly: { maxWidth: "[30rem]" },
      },
      fullWidth: {},
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
  compoundVariants: [
    {
      variant: "default",
      disabled: true,
      css: {
        root: {
          background: "neutral.a20",
          borderColor: "neutral.a50",
          color: "neutral.s80",
        },
      },
    },
    {
      variant: "subtle",
      disabled: true,
      css: {
        root: {
          color: "neutral.s80",
        },
      },
    },
  ],
  defaultVariants: {
    variant: "default",
    size: "md",
    align: "left",
  },
});
