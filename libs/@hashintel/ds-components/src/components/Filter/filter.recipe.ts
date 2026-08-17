import { sva } from "@hashintel/ds-helpers/css";

/**
 * Chip-like segmented shell: [property | operator ▾ | input…]. Segments are
 * divided by inset box-shadow hairlines (no layout cost) reading
 * `--filter-divider`; the focus ring escapes the root's clip via
 * `:has(:focus-visible) { overflow: visible }` (a clip would swallow it).
 */
export const filterRecipe = sva({
  slots: [
    "root",
    "property",
    "trigger",
    "inputSlot",
    "input",
    "separator",
    "remove",
  ],
  base: {
    root: {
      display: "inline-flex",
      alignItems: "stretch",
      width: "[fit-content]",
      whiteSpace: "nowrap",
      colorPalette: "neutral",
      background: "white",
      fontWeight: "medium",
      borderWidth: "1px",
      borderStyle: "solid",
      borderColor: "colorPalette.bd.subtle.hover",
      borderRadius: "[var(--filter-radius)]",
      overflow: "clip",
      isolation: "isolate",
      "--filter-divider": "var(--colors-color-palette-bd-subtle)",
      "--filter-ring":
        "[color-mix(in oklab, var(--colors-color-palette-fg-link) 65%, transparent)]",
      transition: "[border-color 0.15s ease]",
      _hover: {
        borderColor: "colorPalette.bd.solid",
        "--filter-divider": "var(--colors-color-palette-bd-subtle-hover)",
      },
      "&:focus-within": {
        borderColor: "colorPalette.bd.solid",
      },
      "&:has(:focus-visible)": {
        overflow: "visible",
      },
    },
    property: {
      display: "inline-flex",
      alignItems: "center",
      paddingInline: "var(--filter-padding-x)",
      paddingBlock: "var(--filter-padding-y)",
      color: "colorPalette.fg.body",
    },
    trigger: {
      appearance: "none",
      border: "none",
      background: "[transparent]",
      font: "inherit",
      color: "colorPalette.fg.link",
      display: "inline-flex",
      alignItems: "center",
      gap: "1",
      paddingInline: "var(--filter-padding-x)",
      paddingBlock: "var(--filter-padding-y)",
      cursor: "pointer",
      outline: "none",
      boxShadow: "[inset 1px 0 0 0 var(--filter-divider)]",
      transition: "[background 0.15s ease]",
      _hover: {
        background: "[color-mix(in oklab, currentColor 8%, transparent)]",
      },
      "&:focus-visible": {
        boxShadow:
          "[inset 1px 0 0 0 var(--filter-divider), 0 0 0 2px var(--filter-ring)]",
        borderRadius: "[3px]",
        zIndex: "[1]",
      },
      "&[data-placeholder]": {
        color: "colorPalette.fg.body",
        opacity: "[0.6]",
      },
    },
    inputSlot: {
      display: "inline-flex",
      // The input carries the segment's padding itself and stretches to its
      // full height, so e.g. the invalid-character flash paints edge to edge.
      alignItems: "stretch",
      boxShadow: "[inset 1px 0 0 0 var(--filter-divider)]",
    },
    input: {
      appearance: "none",
      border: "none",
      background: "[transparent]",
      outline: "none",
      paddingInline: "var(--filter-padding-x)",
      paddingBlock: "var(--filter-padding-y)",
      font: "inherit",
      color: "colorPalette.fg.body",
      // Grow/shrink with the typed value (or placeholder when empty),
      // clamped below/above (the clamps account for the border-box padding).
      // Browsers without field-sizing fall back to the width implied by the
      // `size` attribute set on text inputs.
      fieldSizing: "content",
      minWidth: "[calc(4ch + 2 * var(--filter-padding-x))]",
      maxWidth: "[calc(32ch + 2 * var(--filter-padding-x))]",
      "&::placeholder": {
        color: "[currentColor]",
        opacity: "[0.4]",
      },
      "&:disabled": {
        cursor: "not-allowed",
      },
      // Hide number spinners (wheel-stepping is disabled separately while
      // focused); `appearance: none` handles Firefox.
      "&::-webkit-outer-spin-button, &::-webkit-inner-spin-button": {
        display: "none",
      },
    },
    separator: {
      display: "inline-flex",
      alignItems: "center",
      paddingInline: "var(--filter-padding-x)",
      paddingBlock: "var(--filter-padding-y)",
      // Fade via color-mix, not opacity — element opacity would also fade
      // the divider box-shadow below.
      color:
        "[color-mix(in oklab, var(--colors-color-palette-fg-body) 65%, transparent)]",
      boxShadow: "[inset 1px 0 0 0 var(--filter-divider)]",
    },
    remove: {
      appearance: "none",
      border: "none",
      background: "[transparent]",
      font: "inherit",
      color: "colorPalette.fg.body",
      display: "inline-flex",
      alignItems: "center",
      paddingInline: "var(--filter-padding-x)",
      paddingBlock: "var(--filter-padding-y)",
      cursor: "pointer",
      outline: "none",
      boxShadow: "[inset 1px 0 0 0 var(--filter-divider)]",
      transition: "[background 0.15s ease]",
      _hover: {
        background: "[color-mix(in oklab, currentColor 8%, transparent)]",
      },
      "&:focus-visible": {
        boxShadow:
          "[inset 1px 0 0 0 var(--filter-divider), 0 0 0 2px var(--filter-ring)]",
        borderRadius: "[3px]",
        zIndex: "[1]",
      },
      "&:disabled": {
        cursor: "not-allowed",
        _hover: { background: "[transparent]" },
      },
    },
  },
  variants: {
    size: {
      xxs: {
        root: {
          fontSize: "xxs",
          lineHeight: "[1.2]",
          "--filter-padding-x": "var(--spacing-1)",
          "--filter-padding-y": "[1px]",
          "--filter-radius": "var(--radii-sm)",
        },
      },
      xs: {
        root: {
          fontSize: "xxs",
          lineHeight: "[1.4]",
          "--filter-padding-x": "var(--spacing-1)",
          "--filter-padding-y": "[1.5px]",
          "--filter-radius": "[5px]",
        },
      },
      sm: {
        root: {
          fontSize: "xxs",
          lineHeight: "[1.5]",
          "--filter-padding-x": "var(--spacing-1)",
          "--filter-padding-y": "[2px]",
          "--filter-radius": "[5px]",
        },
      },
      md: {
        root: {
          fontSize: "xs",
          lineHeight: "[1.5]",
          "--filter-padding-x": "var(--spacing-1\\.5)",
          "--filter-padding-y": "[3px]",
          "--filter-radius": "var(--radii-md)",
        },
      },
      lg: {
        root: {
          fontSize: "sm",
          lineHeight: "[1.5]",
          "--filter-padding-x": "var(--spacing-2)",
          "--filter-padding-y": "[4px]",
          "--filter-radius": "var(--radii-md)",
        },
      },
    },
    invalid: {
      true: {
        root: {
          colorPalette: "red",
          borderColor: "colorPalette.bd.solid",
        },
      },
    },
    disabled: {
      true: {
        root: {
          background: "colorPalette.bgSolid.surface.active",
          _hover: {
            borderColor: "colorPalette.bd.subtle.hover",
            "--filter-divider": "var(--colors-color-palette-bd-subtle)",
          },
        },
        trigger: {
          cursor: "not-allowed",
          _hover: { background: "[transparent]" },
        },
      },
    },
  },
  defaultVariants: {
    size: "md",
    invalid: false,
    disabled: false,
  },
});
