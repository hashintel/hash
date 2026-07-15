import { sva } from "@hashintel/ds-helpers/css";

import { formSizes } from "../../util/form-size.recipe";

export const chipVariants = ["fill", "fillLight", "outline", "subtle"] as const;

export const styles = sva({
  slots: ["root", "label"],
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
