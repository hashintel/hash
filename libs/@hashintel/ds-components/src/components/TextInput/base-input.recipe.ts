import { sva } from "@hashintel/ds-helpers/css";

export const baseInputRecipe = sva({
  slots: [
    "root",
    "inputWrapper",
    "input",
    "hiddenInput",
    "prefix",
    "suffix",
    "adornment",
    "adornmentButton",
    "adornmentText",
    "loading",
    "clear",
    "clearIcon",
    "styledValueOverlay",
    "readonly",
  ],
  base: {
    root: {
      display: "inline-flex",
      position: "relative",
      border: "1px solid transparent",
      width: "[100%]",
      "--base-input-focus-color": "var(--colors-bd-solid)",
      "--base-input-border-color": "var(--colors-bd-solid)",
      "--base-input-border-hover-color": "var(--colors-neutral-s80)",
      "&:not(.layer-style_disabled):hover [data-part='clear']": {
        visibility: "visible",
      },
      "&:focus-within [data-part='clear']": {
        visibility: "visible",
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
      paddingY: "var(--base-input-padding-y)",
      appearance: "none",
      outline: "0",
      border: "none",
      bg: "[inherit]",
      color: "[inherit]",
      borderRadius: "[inherit]",
      _placeholder: { color: "neutral.s80" },
      _disabled: { cursor: "auto" },
    },
    hiddenInput: {
      color: "[transparent]",
      caretColor: "[transparent]",
    },
    prefix: {
      borderLeftRadius: "[inherit]",
      borderRight: "1px solid transparent",
    },
    suffix: {
      borderRightRadius: "[inherit]",
      borderLeft: "1px solid transparent",
    },
    adornment: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      whiteSpace: "nowrap",
    },
    adornmentButton: {
      color: "fg.body",
      cursor: "pointer",
      padding: "0",
      transition: "[background 0.15s ease]",
      _hover: { background: "neutral.s30", color: "neutral.s120" },
      _focusVisible: {
        outline: "1px solid var(--colors-neutral-s80)",
        outlineOffset: "0",
        background: "neutral.s25",
      },
      _focus: { outline: "none" },
    },
    adornmentText: {
      color: "fg.muted",
    },
    loading: {
      alignSelf: "center",
      paddingRight: "2",
    },
    clear: {
      position: "absolute",
      zIndex: "1",
      right: "2",
      display: "flex",
      alignItems: "center",
      visibility: "hidden",
      color: "neutral.s110",
      borderRadius: "full",
      cursor: "pointer",
      _hover: { color: "neutral.s125" },
      _focus: { _after: { background: "neutral.s30" }, outline: "none" },
      _before: {
        content: "''",
        position: "absolute",
        insetY: "[calc(var(--base-input-padding-y) * -1)]",
        insetX: "-1.5",
        background: "white",
        zIndex: "-2",
      },
      _after: {
        content: "''",
        position: "absolute",
        borderRadius: "[inherit]",
        inset: "0",
        zIndex: "-1",
      },
    },
    clearIcon: {
      padding: "0.5",
    },
    styledValueOverlay: {
      position: "absolute",
      inset: "0",
      display: "flex",
      alignItems: "center",
      pointerEvents: "none",
      overflow: "hidden",
      paddingY: "var(--base-input-padding-y)",
    },
  },
  variants: {
    variant: {
      default: {
        root: {
          borderColor: "var(--base-input-border-color)",
          color: "fg.body",
          bg: "white",
          "&:not(.layer-style_disabled):hover": {
            borderColor: "var(--base-input-border-hover-color)",
            bg: "neutral.s10",
          },
          _focusWithin: {
            outline: "[1px solid var(--base-input-focus-color)]",
          },
        },
        adornment: {
          background: "neutral.s20",
          paddingX: "2",
          borderColor: "var(--base-input-border-color)",
        },
        adornmentButton: {
          borderColor: "var(--colors-bd-solid)",
        },
        input: {
          paddingX: "var(--base-input-padding-x)",
        },
        styledValueOverlay: {
          paddingX: "var(--base-input-padding-x)",
        },
      },
      subtle: {
        root: {
          "--base-input-border-hover-color": "var(--colors-neutral-a40)",
          _before: {
            content: '""',
            position: "absolute",
            insetY: "[-1px]",
            insetX: "[calc(-1 * var(--base-input-padding-x))]",
            borderRadius: "[inherit]",
            border: "1px solid transparent",
            pointerEvents: "none",
          },
          "&:not(.layer-style_disabled):hover": {
            _before: {
              borderColor: "var(--base-input-border-hover-color)",
            },
          },
          _focusWithin: {
            bg: "white",
            _before: {
              borderColor: "var(--base-input-border-color)",
            },
          },
        },
        prefix: {
          paddingLeft: "1",
          _focusVisible: {
            borderColor: "var(--colors-bd-solid)",
          },
        },
        suffix: {
          paddingRight: "1",
          _focusVisible: {
            borderColor: "var(--colors-bd-solid)",
          },
        },
        adornmentButton: {
          paddingX: "1",
        },
      },
    },
    size: {
      xs: {
        input: {
          textStyle: "xs",
        },
        styledValueOverlay: {
          textStyle: "xs",
        },
        readonly: {
          textStyle: "xs",
        },
        root: {
          borderRadius: "md",
          "--base-input-padding-x": "spacing.2",
          "--base-input-padding-y": "spacing.0",
        },
      },
      sm: {
        input: {
          textStyle: "sm",
        },
        styledValueOverlay: {
          textStyle: "sm",
        },
        readonly: {
          textStyle: "sm",
        },
        root: {
          borderRadius: "lg",
          "--base-input-padding-x": "spacing.2.5",
          "--base-input-padding-y": "spacing.0.5",
        },
      },
      md: {
        input: {
          textStyle: "base",
        },
        styledValueOverlay: {
          textStyle: "base",
        },
        readonly: {
          textStyle: "base",
        },
        root: {
          borderRadius: "lg",
          "--base-input-padding-x": "spacing.3",
          "--base-input-padding-y": "spacing.1",
        },
      },
      lg: {
        input: {
          textStyle: "base",
        },
        styledValueOverlay: {
          textStyle: "base",
        },
        readonly: {
          textStyle: "base",
        },
        root: {
          borderRadius: "xl",
          "--base-input-padding-x": "spacing.4",
          "--base-input-padding-y": "spacing.2",
        },
      },
    },
    invalid: {
      true: {
        root: {
          "--base-input-focus-color": "var(--colors-status-error-bd-solid)",
          "--base-input-border-color": "var(--colors-status-error-bd-solid)",
          "--base-input-border-hover-color": "var(--colors-red-s65)",
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
    loading: {
      true: {
        clear: {
          right: "1.5",
        },
      },
    },
  },
  compoundVariants: [
    {
      variant: "default",
      disabled: true,
      css: {
        root: {
          "--base-input-border-color": "var(--colors-neutral-a50)",
          background: "neutral.s20",
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
    {
      variant: "default",
      size: "lg",
      css: {
        adornment: {
          paddingX: "2.5",
        },
      },
    },
    {
      variant: "default",
      invalid: true,
      css: {
        root: {
          "&:not(.layer-style_disabled):hover": {
            bg: "red.s05",
          },
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
