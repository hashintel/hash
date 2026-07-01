import { sva } from "@hashintel/ds-helpers/css";

import { formSizes } from "../../util/form-size.recipe";

export const textAreaRecipe = sva({
  slots: [
    "wrapper",
    "root",
    "textareaWrapper",
    "textarea",
    "readonly",
    "charCount",
  ],
  base: {
    wrapper: {
      width: "[100%]",
    },
    root: {
      width: "[100%]",
      position: "relative",
      background: "[var(--base-input-background-color)]",
      border: "var(--form-border-width) solid transparent",
      borderRadius: "var(--base-input-border-radius)",
      transition: "[background 0.15s ease, border 0.15s ease]",
      "--base-input-background-color": "var(--colors-white)",
      "--base-input-focus-color": "var(--colors-neutral-s40)",
      "--base-input-border-color": "var(--colors-neutral-s40)",
      "--base-input-border-hover-color": "var(--colors-neutral-s80)",
    },
    textareaWrapper: {
      overflow: "hidden",
      borderRadius: "var(--base-input-border-radius)",
    },
    textarea: {
      position: "relative",
      display: "block",
      width: "[100%]",
      paddingY: "var(--form-padding-y)",
      appearance: "none",
      outline: "0",
      border: "none",
      bg: "[inherit]",
      color: "[inherit]",
      borderRadius: "var(--base-input-border-radius)",
      fontFamily: "[inherit]",
      fontSize: "[inherit]",
      fontWeight: "[inherit]",
      lineHeight: "[inherit]",
      scrollbarWidth: "[thin]",
      _placeholder: { color: "neutral.s80" },
      _disabled: { cursor: "auto" },
    },
    readonly: {
      display: "block",
      // preserve the author's line breaks when the value is shown as text
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    },
  },
  variants: {
    variant: {
      default: {
        root: {
          borderColor: "var(--base-input-border-color)",
          color: "fg.body",
          "&:not(.layer-style_disabled):hover": {
            borderColor: "var(--base-input-border-hover-color)",
            "--base-input-background-color": "var(--colors-neutral-s10)",
          },
          "&:focus-within:not(.layer-style_disabled)": {
            outline: "[1px solid var(--base-input-focus-color)]",
          },
        },
        textarea: {
          paddingX: "var(--base-input-padding-x)",
        },
      },
      subtle: {
        root: {
          "--base-input-border-hover-color": "var(--colors-neutral-a40)",
          "--base-input-background-color": "transparent",
          _before: {
            content: '""',
            position: "absolute",
            insetY: "[-1px]",
            left: "[calc(-1 * var(--base-input-padding-x))]",
            right: "[0]",
            borderRadius: "var(--base-input-border-radius)",
            border: "1px solid transparent",
            pointerEvents: "none",
            background: "[var(--base-input-background-color)]",
            transition: "[background 0.15s ease, border 0.15s ease]",
          },
          "&:not(.layer-style_disabled):hover": {
            _before: {
              borderColor: "var(--base-input-border-hover-color)",
            },
          },
          "&:focus-within:not(.layer-style_disabled)": {
            "--base-input-background-color": "var(--colors-white)",
            _before: {
              borderColor: "var(--base-input-border-color)",
            },
          },
        },
        textarea: {
          paddingRight: "[calc(var(--base-input-padding-x) * 3 / 4)]",
        },
      },
    },
    size: {
      xxs: {
        wrapper: {
          ...formSizes.variants.sizes.xxs,
          "--base-input-border-radius": "radii.md",
          "--base-input-padding-x": "spacing.2",
        },
        readonly: { textStyle: formSizes.variants.sizes.xxs.textStyle },
      },
      xs: {
        wrapper: {
          ...formSizes.variants.sizes.xs,
          "--base-input-border-radius": "radii.md",
          "--base-input-padding-x": "spacing.2",
        },
        readonly: { textStyle: formSizes.variants.sizes.xs.textStyle },
      },
      sm: {
        wrapper: {
          ...formSizes.variants.sizes.sm,
          "--base-input-border-radius": "radii.lg",
          "--base-input-padding-x": "spacing.2.5",
        },
        readonly: { textStyle: formSizes.variants.sizes.sm.textStyle },
      },
      md: {
        wrapper: {
          ...formSizes.variants.sizes.md,
          "--base-input-border-radius": "radii.lg",
          "--base-input-padding-x": "spacing.3",
        },
        readonly: { textStyle: formSizes.variants.sizes.md.textStyle },
      },
      lg: {
        wrapper: {
          ...formSizes.variants.sizes.lg,
          "--base-input-border-radius": "radii.lg",
          "--base-input-padding-x": "spacing.4",
        },
        readonly: { textStyle: formSizes.variants.sizes.lg.textStyle },
      },
    },
    invalid: {
      true: {
        root: {
          "--base-input-focus-color": "var(--colors-red-s60)",
          "--base-input-border-color": "var(--colors-red-s60)",
          "--base-input-border-hover-color": "var(--colors-red-s65)",
        },
      },
    },
    disabled: {
      true: {
        root: {
          ...({ layerStyle: "disabled" } as Record<string, string>),
          cursor: "auto",
        },
      },
    },
    align: {
      left: { textarea: { textAlign: "start" } },
      center: { textarea: { textAlign: "center" } },
      right: { textarea: { textAlign: "end" } },
    },
    resize: {
      none: { textarea: { resize: "none" } },
      vertical: { textarea: { resize: "vertical" } },
      horizontal: { textarea: { resize: "horizontal" } },
      both: { textarea: { resize: "both" } },
    },
    autoResize: {
      // grow to fit content; the browser handles this natively via field-sizing
      true: { textarea: { fieldSizing: "content" } },
      false: {},
    },
    includeCharCountHeight: {
      true: { charCount: { marginTop: "1" } },
      false: { charCount: { position: "relative", top: "1" } },
    },
  },
  compoundVariants: [
    {
      variant: "subtle",
      size: "xxs",
      css: { root: { "--base-input-padding-x": "spacing.2" } },
    },
    {
      variant: "subtle",
      size: "xs",
      css: { root: { "--base-input-padding-x": "spacing.2" } },
    },
    {
      variant: "subtle",
      size: "sm",
      css: { root: { "--base-input-padding-x": "spacing.2" } },
    },
    {
      variant: "subtle",
      size: "md",
      css: { root: { "--base-input-padding-x": "spacing.2" } },
    },
    {
      variant: "subtle",
      size: "lg",
      css: { root: { "--base-input-padding-x": "spacing.2" } },
    },
    {
      variant: "default",
      disabled: true,
      css: {
        root: {
          "--base-input-border-color": "var(--colors-neutral-s50)",
          "--base-input-background-color": "var(--colors-neutral-s20)",
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
      invalid: true,
      css: {
        root: {
          "&:not(.layer-style_disabled):hover": {
            "--base-input-background-color": "var(--colors-red-s05)",
          },
        },
      },
    },
    {
      variant: "subtle",
      invalid: true,
      css: {
        root: {
          _before: {
            right: "[-1px]",
            borderColor: "var(--base-input-border-color)",
          },
        },
      },
    },
  ],
  defaultVariants: {
    variant: "default",
    size: "md",
    align: "left",
    resize: "vertical",
    autoResize: false,
    includeCharCountHeight: false,
  },
});
