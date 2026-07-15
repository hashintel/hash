import { cva, sva } from "@hashintel/ds-helpers/css";

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
    // The remove button is a trailing zone separated by a 1px divider, matching
    // a `straight` suffix. The divider is a box-shadow so it survives the button
    // reset and adapts to the chip's text colour.
    removeButton: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: "0",
      alignSelf: "stretch",
      cursor: "pointer",
      appearance: "none",
      border: "none",
      background: "[transparent]",
      color: "[inherit]",
      paddingInline: "var(--chip-px)",
      boxShadow:
        "[inset 1px 0 0 0 color-mix(in srgb, currentColor 25%, transparent)]",
      transition: "[background 0.15s ease]",
      _hover: {
        backgroundColor: "[color-mix(in srgb, currentColor 12%, transparent)]",
      },
      "&:focus-visible": {
        outline: "2px solid",
        outlineColor: "black.a60",
        outlineOffset: "[-2px]",
      },
    },
  },
  variants: {
    // Chips are compact: a tight line-height and small vertical padding keep the
    // md size ~20px tall. `--form-*` / `--chip-px` are consumed by the affix zone
    // styles below (circle/angle bleed calculations).
    size: {
      xxs: {
        root: {
          fontSize: "xxs",
          lineHeight: "[1.3]",
          "--form-border-width": "1px",
          "--form-padding-y": "[1px]",
          "--chip-px": "var(--spacing-1)",
          paddingBlock: "var(--form-padding-y)",
          paddingInline: "var(--chip-px)",
          gap: "0.5",
          borderRadius: "sm",
        },
      },
      xs: {
        root: {
          fontSize: "xs",
          lineHeight: "[1.3]",
          "--form-border-width": "1px",
          "--form-padding-y": "[1px]",
          "--chip-px": "var(--spacing-1\\.5)",
          paddingBlock: "var(--form-padding-y)",
          paddingInline: "var(--chip-px)",
          gap: "1",
          borderRadius: "sm",
        },
      },
      sm: {
        root: {
          fontSize: "xs",
          lineHeight: "[1.35]",
          "--form-border-width": "1px",
          "--form-padding-y": "[1px]",
          "--chip-px": "var(--spacing-1\\.5)",
          paddingBlock: "var(--form-padding-y)",
          paddingInline: "var(--chip-px)",
          gap: "1",
          borderRadius: "md",
        },
      },
      md: {
        root: {
          fontSize: "xs",
          lineHeight: "[1.4]",
          "--form-border-width": "1px",
          "--form-padding-y": "[1px]",
          "--chip-px": "var(--spacing-2)",
          paddingBlock: "var(--form-padding-y)",
          paddingInline: "var(--chip-px)",
          gap: "1",
          borderRadius: "md",
        },
      },
      lg: {
        root: {
          fontSize: "sm",
          lineHeight: "[1.4]",
          "--form-border-width": "1px",
          "--form-padding-y": "[2px]",
          "--chip-px": "var(--spacing-2\\.5)",
          paddingBlock: "var(--form-padding-y)",
          paddingInline: "var(--chip-px)",
          gap: "1.5",
          borderRadius: "md",
        },
      },
    },
    // Each colour switches the active colour palette; the variant styles below
    // reference palette-relative tokens (`colorPalette.*`). `black` maps to the
    // neutral palette and is overridden to a solid treatment in compound variants.
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
    // All variants share a tonal language: a palette-toned surface with the
    // palette's `fg.link` (~s110) text. A 1px border keyed to `currentColor`
    // gives a subtle same-hue edge (and adapts to solid `black`).
    variant: {
      fill: {
        root: {
          background: "colorPalette.bg.subtle",
          borderColor: "[color-mix(in srgb, currentColor 15%, transparent)]",
          color: "colorPalette.fg.link",
        },
      },
      fillLight: {
        root: {
          background: "colorPalette.bg.surface",
          color: "colorPalette.fg.link",
        },
      },
      outline: {
        root: {
          borderColor: "colorPalette.bd.solid",
          color: "colorPalette.fg.link",
        },
      },
      subtle: {
        root: { color: "colorPalette.fg.link" },
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
    // ── Clickable hover feedback, per variant (tonal darken) ──
    {
      clickable: true,
      variant: "fill",
      css: {
        root: {
          _hover: {
            background: "colorPalette.bg.shaded",
            borderColor: "[color-mix(in srgb, currentColor 25%, transparent)]",
          },
        },
      },
    },
    {
      clickable: true,
      variant: "fillLight",
      css: { root: { _hover: { background: "colorPalette.bg.subtle" } } },
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
    // ── black: a static alpha colour rendered as a solid chip ──
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
    // black hover overrides (declared after the generic hovers so they win, and
    // so black never borrows the neutral palette's hover tint).
    {
      color: "black",
      variant: "fill",
      clickable: true,
      css: {
        root: {
          _hover: { background: "neutral.s120", borderColor: "neutral.s120" },
        },
      },
    },
    {
      color: "black",
      variant: "fillLight",
      clickable: true,
      css: { root: { _hover: { background: "black.a15" } } },
    },
    {
      color: "black",
      variant: "outline",
      clickable: true,
      css: {
        root: { _hover: { background: "black.a05", borderColor: "black.a70" } },
      },
    },
    {
      color: "black",
      variant: "subtle",
      clickable: true,
      css: { root: { _hover: { background: "black.a05" } } },
    },
  ],
  defaultVariants: {
    size: "md",
    color: "grey",
    variant: "fill",
    shape: "default",
  },
});

// A prefix/suffix slot. `naked` adds no styling beyond the flex base. `straight`
// separates the affix with a 1px divider (a box-shadow keyed to `currentColor`,
// so it survives the button reset and matches the text colour). `circle` and
// `angle` are full-height tinted zones that bleed past the chip's padding +
// border. `interactive` layers a button reset on top.
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
            "[color-mix(in srgb, currentColor 12%, transparent)]",
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
    // straight → a 1px divider on the inner edge (no bleed, no fill).
    {
      treatment: "straight",
      side: "prefix",
      css: {
        boxShadow:
          "[inset -1px 0 0 0 color-mix(in srgb, currentColor 25%, transparent)]",
      },
    },
    {
      treatment: "straight",
      side: "suffix",
      css: {
        boxShadow:
          "[inset 1px 0 0 0 color-mix(in srgb, currentColor 25%, transparent)]",
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
