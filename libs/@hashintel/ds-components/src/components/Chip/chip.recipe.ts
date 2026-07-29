import { cva, sva } from "@hashintel/ds-helpers/css";

export const chipVariants = ["fill", "fillLight", "outline", "subtle"] as const;

export const styles = sva({
  slots: ["root", "label", "centerButton", "removeButton"],
  base: {
    root: {
      display: "inline-flex",
      flex: "[0 1 auto]",
      width: "[fit-content]",
      alignItems: "center",
      fontWeight: "medium",
      whiteSpace: "nowrap",
      userSelect: "none",
      overflow: "clip",
      border: "var(--chip-border-width) solid transparent",
      paddingInlineStart: "var(--chip-padding-x)",
      paddingInlineEnd: "var(--chip-padding-x)",
      "--chip-divider": "var(--colors-color-palette-bd-subtle)",
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
      paddingBlock: "var(--chip-padding-y)",
      paddingInline: "var(--chip-padding-x)",
    },
    centerButton: {
      display: "inline-flex",
      alignItems: "center",
      alignSelf: "stretch",
      minWidth: "0",
      cursor: "pointer",
      appearance: "none",
      border: "none",
      background: "[transparent]",
      color: "[inherit]",
      font: "inherit",
      paddingInline: "var(--chip-padding-x)",
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
      paddingBlock: "var(--chip-padding-y)",
      paddingInlineStart: "var(--chip-padding-x)",
      paddingInlineEnd: "var(--chip-padding-x)",
      boxShadow: "[inset 1px 0 0 0 var(--chip-divider)]",
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
    size: {
      xxs: {
        root: {
          fontSize: "xxs",
          lineHeight: "[1.3]",
          "--chip-border-width": "1px",
          "--chip-padding-y": "[1px]",
          "--chip-padding-x": "var(--spacing-0\\.5)",
          borderRadius: "sm",
        },
      },
      xs: {
        root: {
          fontSize: "xs",
          lineHeight: "[1.3]",
          "--chip-border-width": "1px",
          "--chip-padding-y": "[1px]",
          "--chip-padding-x": "var(--spacing-1)",
          borderRadius: "sm",
        },
      },
      sm: {
        root: {
          fontSize: "xs",
          lineHeight: "[1.35]",
          "--chip-border-width": "1px",
          "--chip-padding-y": "[1px]",
          "--chip-padding-x": "var(--spacing-1)",
          borderRadius: "md",
        },
      },
      md: {
        root: {
          fontSize: "xs",
          lineHeight: "[1.4]",
          "--chip-border-width": "1px",
          "--chip-padding-y": "[1px]",
          "--chip-padding-x": "var(--spacing-1)",
          borderRadius: "md",
        },
      },
      lg: {
        root: {
          fontSize: "sm",
          lineHeight: "[1.4]",
          "--chip-border-width": "1px",
          "--chip-padding-y": "[2px]",
          "--chip-padding-x": "var(--spacing-1\\.5)",
          borderRadius: "md",
        },
      },
    },
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
          background: "colorPalette.bg.subtle",
          borderColor: "colorPalette.bd.solid",
          color: "colorPalette.fg.link",
        },
      },
      fillLight: {
        root: {
          background: "colorPalette.bg.surface",
          borderColor: "colorPalette.bd.subtle",
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
    hasPrefix: {
      true: {
        root: { paddingInlineStart: "0" },
        centerButton: { paddingInlineStart: "0" },
      },
    },
    hasSuffix: {
      true: {
        root: { paddingInlineEnd: "0" },
        centerButton: { paddingInlineEnd: "0" },
      },
    },
    segmented: {
      true: { root: { paddingInlineStart: "0", paddingInlineEnd: "0" } },
    },
  },
  compoundVariants: [
    {
      clickable: true,
      variant: "fill",
      css: {
        root: {
          _hover: {
            background: "colorPalette.bg.shaded",
            borderColor: "colorPalette.bd.solid.hover",
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
    // black has no palette `bd`, so its divider follows the text colour (light
    // on the solid fill, dark on the light variants).
    {
      color: "black",
      css: {
        root: {
          "--chip-divider":
            "[color-mix(in srgb, currentColor 25%, transparent)]",
        },
      },
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

export const affixStyles = cva({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: "0",
    paddingBlock: "var(--chip-padding-y)",
  },
  variants: {
    treatment: {
      naked: {},
      straight: {
        alignSelf: "stretch",
      },
      angle: {
        alignSelf: "stretch",
        paddingInline: "var(--chip-padding-x)",
        marginBlock: "[calc(-1 * var(--chip-border-width))]",
        backgroundColor: "[color-mix(in srgb, currentColor 12%, transparent)]",
      },
      // A brighter (`bgSolid.min`) segment that bleeds to the chip edge and
      // inherits the chip's border-radius, so its outer corners match the chip
      // (fully round on `round`, the small radius on `default`). A box-shadow
      // ring gives its inner (rounded) edge a border and survives the button
      // reset. `overflow: clip` on the root keeps the outer corners aligned; the
      // per-side border-width bleed is set in compound variants.
      circle: {
        alignSelf: "stretch",
        borderRadius: "[inherit]",
        paddingInline: "[0.75em]",
        marginBlock: "[calc(-1 * var(--chip-border-width))]",
        backgroundColor: "colorPalette.bgSolid.min",
        boxShadow: "[inset 0 0 0 1px var(--chip-divider)]",
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
    {
      treatment: "naked",
      side: "prefix",
      css: { paddingInlineStart: "var(--chip-padding-x)" },
    },
    {
      treatment: "naked",
      side: "suffix",
      css: { paddingInlineEnd: "var(--chip-padding-x)" },
    },
    {
      treatment: "straight",
      side: "prefix",
      css: {
        paddingInlineStart: "var(--chip-padding-x)",
        paddingInlineEnd: "var(--chip-padding-x)",
        boxShadow: "[inset -1px 0 0 0 var(--chip-divider)]",
      },
    },
    {
      treatment: "straight",
      side: "suffix",
      css: {
        paddingInlineStart: "var(--chip-padding-x)",
        paddingInlineEnd: "var(--chip-padding-x)",
        boxShadow: "[inset 1px 0 0 0 var(--chip-divider)]",
      },
    },
    {
      treatment: "circle",
      side: "prefix",
      css: {
        marginInlineStart: "[calc(-1 * var(--chip-border-width))]",
      },
    },
    {
      treatment: "circle",
      side: "suffix",
      css: {
        marginInlineEnd: "[calc(-1 * var(--chip-border-width))]",
      },
    },
    {
      treatment: "angle",
      side: "prefix",
      css: {
        marginInlineStart: "[calc(-1 * var(--chip-border-width))]",
        paddingInlineEnd: "[calc(var(--chip-padding-x) + 0.5em)]",
        clipPath: "[polygon(0 0, 100% 0, calc(100% - 0.5em) 100%, 0 100%)]",
      },
    },
    {
      treatment: "angle",
      side: "suffix",
      css: {
        marginInlineEnd: "[calc(-1 * var(--chip-border-width))]",
        paddingInlineStart: "[calc(var(--chip-padding-x) + 0.5em)]",
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
