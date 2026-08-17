import { sva } from "@hashintel/ds-helpers/css";

import { formSizes } from "../../util/form-size.recipe";

/**
 * Chip-like segmented shell: [property | operator ▾ | input…]. Each segment
 * draws its own real borders: top/bottom (plus the first segment's left and
 * the last segment's right, with the corner radii) read
 * `--filter-outer-border` and together form the chip's outline, while every
 * other segment's left border reads `--filter-divider` and draws the
 * internal hairline. The root only rounds/clips; hover and state changes
 * re-point the levers. The focus ring escapes the root's clip via
 * `:has(:focus-visible) { overflow: visible }` (a clip would swallow it).
 */
export const filterRecipe = sva({
  slots: [
    "root",
    "property",
    "trigger",
    "triggerLabel",
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
      // Shrink to fit a constrained container: the property, trigger and
      // input segments give way (ellipsifying), separators and the remove
      // button never do.
      maxWidth: "[100%]",
      whiteSpace: "nowrap",
      background: "white",
      fontWeight: "medium",
      borderRadius: "[var(--filter-radius)]",
      overflow: "clip",
      isolation: "isolate",
      // Solid greys throughout; only the focus ring uses the alpha scale so
      // it composites over whatever sits behind the (escaping) ring.
      "--filter-outer-border": "var(--colors-neutral-s50)",
      "--filter-divider": "var(--colors-neutral-s40)",
      // The remove button's divider: follows the same rest/hover shades but
      // is a separate lever so the `complete` variant never hides it.
      "--filter-remove-divider": "var(--colors-neutral-s40)",
      // Edge shades for a hovered/pressed interactive segment (trigger,
      // input, remove).
      "--filter-hover-border": "var(--colors-neutral-s80)",
      "--filter-pressed-border": "var(--colors-neutral-s70)",
      "--filter-input-hover-bg": "var(--colors-neutral-s10)",
      "--filter-ring": "var(--colors-neutral-a80)",
      // Per-slot horizontal padding, defaulting to the shared segment
      // padding; the smallest sizes bump these individually below.
      "--filter-property-padding-x": "var(--filter-padding-x)",
      "--filter-input-padding-x": "var(--filter-padding-x)",
      _hover: {
        "--filter-outer-border": "var(--colors-neutral-s60)",
        "--filter-divider": "var(--colors-neutral-s50)",
        "--filter-remove-divider": "var(--colors-neutral-s50)",
      },
      "&:focus-within": {
        "--filter-outer-border": "var(--colors-neutral-s60)",
      },
      // Hovering the remove button darkens the whole chip outline to the
      // same shade its own edges take (removal affects the entire filter).
      "&:has([data-part=remove]:hover:not(:disabled))": {
        "--filter-outer-border": "var(--filter-hover-border)",
      },
      "&:has(:focus-visible)": {
        overflow: "visible",
      },
    },
    property: {
      // Block (not flex) so its text can text-overflow: ellipsis; vertical
      // centering falls out of the padding + single line box.
      display: "block",
      overflow: "hidden",
      textOverflow: "ellipsis",
      minWidth: "[4ch]",
      fontSize: "[var(--filter-font-size)]",
      paddingInline: "var(--filter-property-padding-x)",
      paddingBlock: "var(--form-padding-y)",
      color: "neutral.s115",
      borderBlock: "var(--form-border-width) solid var(--filter-outer-border)",
      borderInlineStart:
        "var(--form-border-width) solid var(--filter-outer-border)",
      borderStartStartRadius: "[var(--filter-radius)]",
      borderEndStartRadius: "[var(--filter-radius)]",
      transition: "[border-color 0.15s ease]",
    },
    trigger: {
      appearance: "none",
      border: "none",
      background: "[transparent]",
      font: "inherit",
      color: "neutral.s110",
      fontSize: "[var(--filter-font-size)]",
      fontWeight: "normal",
      display: "inline-flex",
      alignItems: "center",
      gap: "1",
      position: "relative",
      minWidth: "[5ch]",
      paddingInline: "var(--filter-padding-x)",
      paddingBlock: "var(--form-padding-y)",
      cursor: "pointer",
      outline: "none",
      "& svg": {
        flexShrink: "0",
      },
      borderBlock: "var(--form-border-width) solid var(--filter-outer-border)",
      borderInlineStart: "var(--form-border-width) solid var(--filter-divider)",
      transition: "[background 0.15s ease, border-color 0.15s ease]",
      _hover: {
        background: "neutral.s25",
      },
      // Pressed style while the dropdown is open (mirrors Button's subtle
      // neutral pressed treatment); hovering a pressed trigger shows the
      // hover background (the explicit :hover form makes that deterministic
      // against the equal-specificity plain hover rule).
      "&[data-state=open], &[data-state=open]:hover": {
        boxShadow: "[inset 0 2px 4px rgba(0,0,0,0.05)]",
      },
      "&[data-state=open]": {
        background: "neutral.s20",
      },
      "&[data-state=open]:hover": {
        background: "neutral.s25",
      },
      // A pressed-but-unhovered trigger keeps its section edges darkened,
      // one step lighter than the hover shade.
      "&[data-state=open]:not(:hover)": {
        "--filter-divider": "var(--filter-pressed-border)",
        "--filter-outer-border": "var(--filter-pressed-border)",
      },
      "&[data-state=open]:not(:hover) + *": {
        "--filter-divider": "var(--filter-pressed-border)",
        "--filter-remove-divider": "var(--filter-pressed-border)",
      },
      // Hovering darkens the section's edges like an input section: its own
      // left/top/bottom (plus right when last) here, the next segment's left
      // border below.
      "&:hover:not(:disabled)": {
        "--filter-divider": "var(--filter-hover-border)",
        "--filter-outer-border": "var(--filter-hover-border)",
      },
      "&:hover:not(:disabled) + *": {
        "--filter-divider": "var(--filter-hover-border)",
        "--filter-remove-divider": "var(--filter-hover-border)",
      },
      // The ring lives on an ::after with its own small radius so square
      // segment corners still get a softly rounded ring.
      "&:focus-visible": {
        zIndex: "[1]",
      },
      "&:focus-visible::after": {
        content: '""',
        position: "absolute",
        inset: "0",
        borderRadius: "[3px]",
        boxShadow: "[0 0 0 2px var(--filter-ring)]",
        pointerEvents: "none",
      },
      // Fade the placeholder via color, not element opacity — opacity would
      // also fade the borders and the focus ring ::after.
      "&[data-placeholder]": {
        color: "neutral.s90",
      },
      "&:last-child": {
        borderInlineEnd:
          "var(--form-border-width) solid var(--filter-outer-border)",
        borderStartEndRadius: "[var(--filter-radius)]",
        borderEndEndRadius: "[var(--filter-radius)]",
      },
    },
    triggerLabel: {
      overflow: "hidden",
      textOverflow: "ellipsis",
      minWidth: "0",
    },
    inputSlot: {
      display: "inline-flex",
      minWidth: "0",
      // The input carries the segment's padding itself and stretches to its
      // full height, so e.g. the invalid-character flash paints edge to edge.
      alignItems: "stretch",
      borderBlock: "var(--form-border-width) solid var(--filter-outer-border)",
      borderInlineStart: "var(--form-border-width) solid var(--filter-divider)",
      transition: "[border-color 0.15s ease, background 0.15s ease]",
      // Hovering an (enabled) input section darkens all four of its edges to
      // BaseInput's hover border color — its own left/top/bottom here, and
      // the next segment's left border (which draws this section's right
      // edge) below — and tints the section with a subtle grey.
      "&:hover:not([data-disabled])": {
        "--filter-divider": "var(--filter-hover-border)",
        "--filter-outer-border": "var(--filter-hover-border)",
        background: "[var(--filter-input-hover-bg)]",
      },
      "&:hover:not([data-disabled]) + *": {
        "--filter-divider": "var(--filter-hover-border)",
        "--filter-remove-divider": "var(--filter-hover-border)",
      },
      "&:last-child": {
        borderInlineEnd:
          "var(--form-border-width) solid var(--filter-outer-border)",
        borderStartEndRadius: "[var(--filter-radius)]",
        borderEndEndRadius: "[var(--filter-radius)]",
      },
    },
    input: {
      appearance: "none",
      border: "none",
      background: "[transparent]",
      outline: "none",
      paddingInline: "var(--filter-input-padding-x)",
      paddingBlock: "var(--form-padding-y)",
      font: "inherit",
      fontSize: "[var(--filter-font-size)]",
      color: "neutral.s115",
      // Grow/shrink with the typed value (or placeholder when empty),
      // clamped below/above (the clamps account for the border-box padding).
      // Browsers without field-sizing fall back to the width implied by the
      // `size` attribute set on text inputs.
      fieldSizing: "content",
      minWidth: "[calc(2 * var(--filter-input-padding-x))]",
      textAlign: "center",
      maxWidth: "[min(calc(32ch + 2 * var(--filter-input-padding-x)), 100%)]",
      // Overflowing values ellipsify at rest; a focused input scrolls
      // normally instead.
      textOverflow: "ellipsis",
      _focus: {
        textAlign: "left",
        textOverflow: "clip",
      },
      "&::placeholder": {
        color: "[currentColor]",
        opacity: "[0.4]",
      },
      "&:disabled": {
        cursor: "auto",
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
      flexShrink: "0",
      fontSize: "[var(--filter-font-size)]",
      fontWeight: "normal",
      paddingInline: "var(--filter-padding-x)",
      paddingBlock: "var(--form-padding-y)",
      color: "neutral.s100",
      borderBlock: "var(--form-border-width) solid var(--filter-outer-border)",
      borderInlineStart: "var(--form-border-width) solid var(--filter-divider)",
      transition: "[border-color 0.15s ease]",
    },
    remove: {
      appearance: "none",
      border: "none",
      background: "[transparent]",
      font: "inherit",
      color: "neutral.s115",
      display: "inline-flex",
      alignItems: "center",
      flexShrink: "0",
      position: "relative",
      paddingInline: "var(--filter-padding-x)",
      paddingBlock: "var(--form-padding-y)",
      cursor: "pointer",
      outline: "none",
      borderBlock: "var(--form-border-width) solid var(--filter-outer-border)",
      borderInlineStart:
        "var(--form-border-width) solid var(--filter-remove-divider)",
      transition: "[background 0.15s ease, border-color 0.15s ease]",
      _hover: {
        background: "neutral.s25",
      },
      // Hovering darkens the section's edges (own left/top/bottom, plus
      // right via the last-child border reading the same lever).
      "&:hover:not(:disabled)": {
        "--filter-remove-divider": "var(--filter-hover-border)",
        "--filter-outer-border": "var(--filter-hover-border)",
      },
      // The ring lives on an ::after with its own small radius so square
      // segment corners still get a softly rounded ring.
      "&:focus-visible": {
        zIndex: "[1]",
      },
      "&:focus-visible::after": {
        content: '""',
        position: "absolute",
        inset: "0",
        borderRadius: "[3px]",
        boxShadow: "[0 0 0 2px var(--filter-ring)]",
        pointerEvents: "none",
      },
      "&:last-child": {
        borderInlineEnd:
          "var(--form-border-width) solid var(--filter-outer-border)",
        borderStartEndRadius: "[var(--filter-radius)]",
        borderEndEndRadius: "[var(--filter-radius)]",
      },
    },
  },
  variants: {
    // Sizing (text style, vertical padding, border width) comes from the
    // shared `formSizes` config so each size renders exactly as tall as a
    // BaseInput of the same size; only the horizontal density and corner
    // radius are chip-specific.
    // `--filter-font-size` sets the segments' text size WITHOUT affecting
    // height: the root's textStyle line-height computes to px there and is
    // inherited as that fixed value, so smaller segment text keeps the same
    // line box (and therefore the BaseInput-matched heights).
    size: {
      xxs: {
        root: {
          ...formSizes.variants.sizes.xxs,
          "--filter-font-size": "var(--font-sizes-xxs)",
          "--filter-padding-x": "[5px]",
          "--filter-property-padding-x": "[5px]",
          "--filter-radius": "var(--radii-sm)",
        },
      },
      xs: {
        root: {
          ...formSizes.variants.sizes.xs,
          "--filter-font-size": "[11px]",
          "--filter-padding-x": "[5px]",
          "--filter-property-padding-x": "var(--spacing-1\\.5)",
          "--filter-input-padding-x": "[7px]",
          "--filter-radius": "[5px]",
        },
      },
      sm: {
        root: {
          ...formSizes.variants.sizes.sm,
          "--filter-font-size": "[12px]",
          "--filter-padding-x": "[7px]",
          "--filter-property-padding-x": "[7px]",
          "--filter-radius": "[5px]",
        },
      },
      md: {
        root: {
          ...formSizes.variants.sizes.md,
          "--filter-font-size": "[14px]",
          "--filter-padding-x": "[11px]",
          "--filter-property-padding-x": "[9px]",
          "--filter-radius": "var(--radii-md)",
        },
      },
      lg: {
        root: {
          ...formSizes.variants.sizes.lg,
          "--filter-font-size": "var(--font-sizes-base)",
          "--filter-padding-x": "[11px]",
          "--filter-property-padding-x": "[11px]",
          "--filter-radius": "var(--radii-md)",
        },
      },
    },
    // The error state only re-colors borders and the focus ring — text and
    // background treatments stay neutral. Chip-level hover/focus-within are
    // pinned to the rest shades so borders only darken (to a deeper red)
    // when an interactive segment (trigger, input, remove) is hovered.
    invalid: {
      true: {
        root: {
          "--filter-outer-border": "var(--colors-red-s60)",
          "--filter-divider": "var(--colors-red-s40)",
          "--filter-remove-divider": "var(--colors-red-s40)",
          "--filter-hover-border": "var(--colors-red-s80)",
          "--filter-pressed-border": "var(--colors-red-s70)",
          "--filter-ring": "var(--colors-red-a80)",
          _hover: {
            "--filter-outer-border": "var(--colors-red-s60)",
            "--filter-divider": "var(--colors-red-s40)",
            "--filter-remove-divider": "var(--colors-red-s40)",
          },
          "&:focus-within": {
            "--filter-outer-border": "var(--colors-red-s60)",
          },
        },
        // Dark red text everywhere except the remove button, which keeps its
        // neutral color (it acts on the filter, not the erroneous value).
        property: { color: "red.s115" },
        trigger: {
          color: "red.s115",
          "&[data-placeholder]": { color: "red.s80" },
        },
        input: { color: "red.s115" },
        separator: { color: "red.s115" },
        remove: { color: "neutral.s120" },
      },
    },
    // A fully filled-in filter reads as one unit: its internal segment
    // dividers lighten at rest and return to full strength on
    // hover/focus-within. (The remove button's divider is unaffected.)
    complete: {
      true: {
        root: {
          "&:not(:hover):not(:focus-within)": {
            "--filter-divider": "var(--colors-neutral-s30)",
          },
        },
      },
    },
    disabled: {
      true: {
        root: {
          background: "neutral.s20",
          _hover: {
            "--filter-outer-border": "var(--colors-neutral-s50)",
            "--filter-divider": "var(--colors-neutral-s40)",
            "--filter-remove-divider": "var(--colors-neutral-s40)",
          },
        },
        property: { color: "neutral.s90" },
        trigger: {
          cursor: "auto",
          color: "neutral.s90",
          _hover: { background: "[transparent]" },
          "&[data-placeholder]": { color: "neutral.s80" },
        },
        input: { color: "neutral.s90" },
        separator: { color: "neutral.s80" },
        // The remove button stays active on a disabled filter, so it keeps
        // the normal background instead of the chip's disabled grey (its
        // higher-specificity hover background still applies).
        remove: { background: "white" },
      },
    },
  },
  compoundVariants: [
    // Keep the complete-state lightened divider red-tinted on an invalid
    // filter (the neutral lightened shade would read as unrelated grey).
    {
      invalid: true,
      complete: true,
      css: {
        root: {
          "&:not(:hover):not(:focus-within)": {
            "--filter-divider": "var(--colors-red-s30)",
          },
        },
      },
    },
  ],
  defaultVariants: {
    size: "md",
    invalid: false,
    disabled: false,
    complete: false,
  },
});
