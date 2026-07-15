import { cva, sva } from "@hashintel/ds-helpers/css";

import { formSizes } from "../../util/form-size.recipe";

export const chipVariants = ["fill", "fillLight", "outline", "subtle"] as const;

export const styles = sva({
  slots: ["root", "label", "removeButton"],
  base: {
    root: {
      display: "inline-flex",
      alignItems: "center",
      maxWidth: "full",
      fontWeight: "medium",
      whiteSpace: "nowrap",
      userSelect: "none",
      overflow: "clip",
      border: "var(--form-border-width) solid transparent",
      transition:
        "[background 0.15s ease, color 0.15s ease, border 0.15s ease]",
      "&:focus-visible": {
        outline: "2px solid",
        outlineColor: "black.a60",
      },
    },
    label: {
      overflow: "hidden",
      textOverflow: "ellipsis",
      minWidth: "0",
    },
    removeButton: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: "0",
      cursor: "pointer",
      appearance: "none",
      border: "none",
      background: "[transparent]",
      color: "[inherit]",
      padding: "0",
      borderRadius: "full",
      opacity: "0.7",
      transition: "[opacity 0.15s ease, background 0.15s ease]",
      _hover: {
        opacity: "1",
        backgroundColor: "[color-mix(in srgb, currentColor 18%, transparent)]",
      },
      "&:focus-visible": {
        outline: "2px solid",
        outlineColor: "black.a60",
        outlineOffset: "[-1px]",
        opacity: "1",
      },
    },
  },
  variants: {
    size: {
      xxs: {
        root: {
          ...formSizes.variants.sizes.xxs,
          "--chip-px": "var(--spacing-1)",
          paddingX: "var(--chip-px)",
          paddingY: "var(--form-padding-y)",
          gap: "1",
          borderRadius: "sm",
        },
      },
      xs: {
        root: {
          ...formSizes.variants.sizes.xs,
          "--chip-px": "var(--spacing-1\\.5)",
          paddingX: "var(--chip-px)",
          paddingY: "var(--form-padding-y)",
          gap: "1",
          borderRadius: "sm",
        },
      },
      sm: {
        root: {
          ...formSizes.variants.sizes.sm,
          "--chip-px": "var(--spacing-2)",
          paddingX: "var(--chip-px)",
          paddingY: "var(--form-padding-y)",
          gap: "1.5",
          borderRadius: "md",
        },
      },
      md: {
        root: {
          ...formSizes.variants.sizes.md,
          "--chip-px": "var(--spacing-2\\.5)",
          paddingX: "var(--chip-px)",
          paddingY: "var(--form-padding-y)",
          gap: "1.5",
          borderRadius: "md",
        },
      },
      lg: {
        root: {
          ...formSizes.variants.sizes.lg,
          "--chip-px": "var(--spacing-3)",
          paddingX: "var(--chip-px)",
          paddingY: "var(--form-padding-y)",
          gap: "2",
          borderRadius: "lg",
        },
      },
    },
    // Each colour switches the active colour palette; the variant styles below
    // reference palette-relative tokens (`colorPalette.*`). `black` maps to the
    // neutral palette and is overridden to true black in compound variants.
    color: {
      grey: { root: { colorPalette: "neutral" } },
      red: { root: { colorPalette: "red" } },
      blue: { root: { colorPalette: "blue" } },
      green: { root: { colorPalette: "green" } },
      orange: { root: { colorPalette: "orange" } },
      yellow: { root: { colorPalette: "yellow" } },
      purple: { root: { colorPalette: "purple" } },
      pink: { root: { colorPalette: "pink" } },
      black: { root: { colorPalette: "neutral" } },
    },
    variant: {
      fill: {
        root: {
          background: "colorPalette.bg.solid",
          borderColor: "colorPalette.bg.solid",
          color: "colorPalette.fg.onSolid",
        },
      },
      fillLight: {
        root: {
          background: "colorPalette.bg.subtle",
          color: "colorPalette.fg.body",
        },
      },
      outline: {
        root: {
          borderColor: "colorPalette.bd.solid",
          color: "colorPalette.fg.body",
        },
      },
      subtle: {
        root: { color: "colorPalette.fg.body" },
      },
    },
    // `round` is declared after `size` so it wins the border-radius cascade.
    shape: {
      default: {},
      round: { root: { borderRadius: "full" } },
    },
    clickable: {
      true: { root: { cursor: "pointer" } },
    },
  },
  compoundVariants: [
    // ── Clickable hover feedback, per variant ──
    {
      clickable: true,
      variant: "fill",
      css: {
        root: {
          _hover: {
            background: "colorPalette.bg.solid.hover",
            borderColor: "colorPalette.bg.solid.hover",
          },
        },
      },
    },
    {
      clickable: true,
      variant: "fillLight",
      css: { root: { _hover: { background: "colorPalette.bg.subtle.hover" } } },
    },
    {
      clickable: true,
      variant: "outline",
      css: {
        root: {
          _hover: {
            background: "colorPalette.bg.surface",
            borderColor: "colorPalette.bd.solid.hover",
          },
        },
      },
    },
    {
      clickable: true,
      variant: "subtle",
      css: { root: { _hover: { background: "colorPalette.bg.surface" } } },
    },
    // ── black: a static alpha colour with no semantic set ──
    {
      color: "black",
      variant: "fill",
      css: {
        root: { background: "black", borderColor: "black", color: "white" },
      },
    },
    {
      color: "black",
      variant: "fillLight",
      css: { root: { background: "black.a10", color: "black.a90" } },
    },
    {
      color: "black",
      variant: "outline",
      css: { root: { borderColor: "black.a55", color: "black.a90" } },
    },
    {
      color: "black",
      variant: "subtle",
      css: { root: { color: "black.a90" } },
    },
  ],
  defaultVariants: {
    size: "sm",
    color: "grey",
    variant: "fillLight",
    shape: "default",
  },
});

// A prefix/suffix slot. `naked` adds no styling beyond the flex base.
// `straight`/`angle` are full-height zones that bleed past the chip's padding +
// border to sit flush with the (clipped) pill edge; both use a `currentColor`-
// keyed tint for colour-agnostic contrast. `circle` is a badge sized to the
// content height. `interactive` layers a button reset on top.
export const affixStyles = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: "0",
  },
  variants: {
    treatment: {
      naked: {},
      straight: {
        alignSelf: "stretch",
        paddingInline: "var(--chip-px)",
        marginBlock:
          "[calc(-1 * var(--form-padding-y) - var(--form-border-width))]",
        backgroundColor: "[color-mix(in srgb, currentColor 12%, transparent)]",
      },
      angle: {
        alignSelf: "stretch",
        paddingInline: "var(--chip-px)",
        marginBlock:
          "[calc(-1 * var(--form-padding-y) - var(--form-border-width))]",
        backgroundColor: "[color-mix(in srgb, currentColor 12%, transparent)]",
      },
      circle: {
        alignSelf: "stretch",
        aspectRatio: "1",
        borderRadius: "full",
        backgroundColor: "[color-mix(in srgb, currentColor 12%, transparent)]",
      },
    },
    side: {
      prefix: {},
      suffix: {},
    },
    interactive: {
      true: {
        cursor: "pointer",
        appearance: "none",
        font: "inherit",
        color: "[inherit]",
        border: "none",
        _hover: {
          backgroundColor:
            "[color-mix(in srgb, currentColor 20%, transparent)]",
        },
        "&:focus-visible": {
          outline: "2px solid",
          outlineColor: "black.a60",
          outlineOffset: "[-2px]",
        },
      },
    },
  },
  compoundVariants: [
    {
      treatment: "straight",
      side: "prefix",
      css: {
        marginInlineStart:
          "[calc(-1 * var(--chip-px) - var(--form-border-width))]",
      },
    },
    {
      treatment: "straight",
      side: "suffix",
      css: {
        marginInlineEnd:
          "[calc(-1 * var(--chip-px) - var(--form-border-width))]",
      },
    },
    {
      treatment: "angle",
      side: "prefix",
      css: {
        marginInlineStart:
          "[calc(-1 * var(--chip-px) - var(--form-border-width))]",
        paddingInlineEnd: "[calc(var(--chip-px) + 0.5em)]",
        clipPath: "[polygon(0 0, 100% 0, calc(100% - 0.5em) 100%, 0 100%)]",
      },
    },
    {
      treatment: "angle",
      side: "suffix",
      css: {
        marginInlineEnd:
          "[calc(-1 * var(--chip-px) - var(--form-border-width))]",
        paddingInlineStart: "[calc(var(--chip-px) + 0.5em)]",
        clipPath: "[polygon(0.5em 0, 100% 0, 100% 100%, 0 100%)]",
      },
    },
  ],
  defaultVariants: {
    treatment: "straight",
    side: "prefix",
  },
});

// A status dot drawn with `currentColor` so it always matches the chip's text.
export const dotStyles = cva({
  base: {
    display: "inline-block",
    flexShrink: "0",
    borderRadius: "full",
    boxSizing: "border-box",
    borderWidth: "1.5px",
    borderStyle: "solid",
    borderColor: "[currentColor]",
  },
  variants: {
    size: {
      xxs: { width: "[6px]", height: "[6px]" },
      xs: { width: "[6px]", height: "[6px]" },
      sm: { width: "[7px]", height: "[7px]" },
      md: { width: "[8px]", height: "[8px]" },
      lg: { width: "[9px]", height: "[9px]" },
    },
    state: {
      filled: { background: "[currentColor]" },
      partiallyFilled: {
        background:
          "[linear-gradient(to right, currentColor 0 50%, transparent 50% 100%)]",
      },
      empty: { background: "[transparent]" },
    },
  },
  defaultVariants: {
    size: "sm",
    state: "filled",
  },
});
