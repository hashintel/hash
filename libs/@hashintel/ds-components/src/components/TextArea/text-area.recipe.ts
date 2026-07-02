import { sva } from "@hashintel/ds-helpers/css";

import { formSizes } from "../../util/form-size.recipe";

export const textAreaRecipe = sva({
  slots: [
    "wrapper",
    "root",
    "subtleOverlay",
    "textarea",
    "readonly",
    "charCount",
  ],
  base: {
    wrapper: {
      width: "[100%]",
      position: "relative",
      isolation: "isolate",
      "--base-input-background-color": "var(--colors-white)",
      "--base-input-focus-color": "var(--colors-neutral-s40)",
      "--base-input-border-color": "var(--colors-neutral-s40)",
      "--base-input-border-hover-color": "var(--colors-neutral-s80)",
    },
    root: {
      width: "[100%]",
      maxWidth: "[100%]",
      position: "relative",
      anchorName: "[--textarea-root]",
      overflow: "hidden",
      background: "[var(--base-input-background-color)]",
      border: "var(--form-border-width) solid transparent",
      borderRadius: "var(--base-input-border-radius)",
      transition: "[background 0.15s ease, border 0.15s ease]",
    },
    subtleOverlay: {
      position: "absolute",
      positionAnchor: "[--textarea-root]",
      top: "[calc(anchor(--textarea-root top) - 1px)]",
      left: "[calc(anchor(--textarea-root left) - var(--base-input-padding-x))]",
      width:
        "[calc(anchor-size(--textarea-root width) + var(--base-input-padding-x))]",
      height: "[calc(anchor-size(--textarea-root height) + 2px)]",
      zIndex: "[-1]",
      borderRadius: "var(--base-input-border-radius)",
      border: "1px solid var(--textarea-overlay-border-color, transparent)",
      background: "[var(--base-input-background-color)]",
      pointerEvents: "none",
      transition: "[background 0.15s ease, border 0.15s ease]",
    },
    textarea: {
      height: "[100%]",
      resize: "none",
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
        wrapper: {
          "--base-input-border-hover-color": "var(--colors-neutral-a40)",
          "--base-input-background-color": "transparent",
          "--textarea-overlay-border-color": "transparent",
          // hovering the box (not the character counter) shows the subtle border
          "&:has([data-part='textarea-box']:not(.layer-style_disabled):hover)":
            {
              "--textarea-overlay-border-color":
                "var(--base-input-border-hover-color)",
            },
          // focusing the textarea fills the background and shows the border
          "&:focus-within": {
            "--base-input-background-color": "var(--colors-white)",
            "--textarea-overlay-border-color": "var(--base-input-border-color)",
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
        wrapper: {
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
      none: { root: { resize: "none" } },
      vertical: { root: { resize: "vertical" } },
      horizontal: { root: { resize: "horizontal" } },
      both: { root: { resize: "both" } },
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
        wrapper: {
          "--textarea-overlay-border-color": "var(--base-input-border-color)",
        },
        subtleOverlay: {
          width:
            "[calc(anchor-size(--textarea-root width) + var(--base-input-padding-x) + 1px)]",
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
