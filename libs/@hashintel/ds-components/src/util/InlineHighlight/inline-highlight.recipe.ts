import { cva } from "@hashintel/ds-helpers/css";

import type { SystemStyleObject } from "@hashintel/ds-helpers/types";

export type InlineHighlightColor =
  | "grey"
  | "red"
  | "blue"
  | "green"
  | "orange"
  | "yellow"
  | "purple"
  | "pink";

export type InlineHighlightVariant = "defined" | "soft";

/**
 * Background + border for inline text where the border wraps the rendered
 * text shape across line breaks, instead of each line fragment closing off
 * with its own edges.
 *
 * A real border is drawn per fragment, so a wrapped span shows borders
 * between the lines. Here each fragment paints only its opaque background
 * (`box-decoration-break: clone` pads and rounds every fragment), and the
 * border is four chained drop-shadows of the element's silhouette — the
 * filter applies to the inline element's fragments as one image, so the
 * shadows trace the union outline. The vertical padding bridges the leading
 * gap so adjacent fragments merge into one shape; leading much looser than
 * 1.55 reopens the gap and the outline falls back to per-line boxes.
 *
 * Consumers override via custom properties the recipe only reads, never
 * declares — set them in a class on the element or any ancestor:
 * `--inline-highlight-bg`, `--inline-highlight-ring-color`,
 * `--inline-highlight-padding-inline`, `--inline-highlight-padding-block`.
 * Declaring them here instead would shadow ancestor values and leave
 * same-element classes racing on stylesheet order.
 */
export const styles = cva({
  base: {
    boxDecorationBreak: "clone",
    borderRadius: "[0.3em]",
    paddingInline: "[var(--inline-highlight-padding-inline, 0.3em)]",
    paddingBlock: "[var(--inline-highlight-padding-block, 0.18em)]",
    // The ring paints outside the padding box — keep it off neighbouring text.
    marginInline: "[var(--inline-highlight-ring-width)]",
    "--inline-highlight-ring-width": "[1px]",
    background:
      "[var(--inline-highlight-bg, var(--inline-highlight-bg-default))]",
    "--inline-highlight-ring":
      "[var(--inline-highlight-ring-color, var(--inline-highlight-ring-default))]",
    filter:
      "[drop-shadow(var(--inline-highlight-ring-width) 0 0 var(--inline-highlight-ring)) drop-shadow(calc(-1 * var(--inline-highlight-ring-width)) 0 0 var(--inline-highlight-ring)) drop-shadow(0 var(--inline-highlight-ring-width) 0 var(--inline-highlight-ring)) drop-shadow(0 calc(-1 * var(--inline-highlight-ring-width)) 0 var(--inline-highlight-ring))]",
  },
  variants: {
    color: {
      grey: { colorPalette: "neutral" },
      red: { colorPalette: "red" },
      blue: { colorPalette: "blue" },
      green: { colorPalette: "green" },
      orange: { colorPalette: "orange" },
      yellow: { colorPalette: "yellow" },
      purple: { colorPalette: "purple" },
      pink: { colorPalette: "pink" },
    } satisfies Record<InlineHighlightColor, SystemStyleObject>,
    variant: {
      defined: {
        color: "colorPalette.fg.link",
        "--inline-highlight-bg-default":
          "var(--colors-color-palette-bg-solid-subtle)",
        "--inline-highlight-ring-default":
          "var(--colors-color-palette-bg-solid-shaded-hover)",
      },
      soft: {
        color: "colorPalette.fg.link",
        "--inline-highlight-bg-default":
          "var(--colors-color-palette-bg-solid-surface-active)",
        "--inline-highlight-ring-default":
          "var(--colors-color-palette-bg-solid-subtle-hover)",
      },
    } satisfies Record<InlineHighlightVariant, SystemStyleObject>,
  },
  defaultVariants: {
    color: "grey",
    variant: "defined",
  },
});
