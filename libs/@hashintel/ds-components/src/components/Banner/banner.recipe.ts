import { sva } from "@hashintel/ds-helpers/css";

export const bannerTones = [
  "neutral",
  "brand",
  "error",
  "caution",
  "success",
] as const;

export const bannerVariants = ["fill", "outline"] as const;

/**
 * A horizontal inline notice laid out as a flex row of three items: a leading
 * icon, a content column (title / description / custom children, stacked), and a
 * trailing actions region. The icon and actions align to the top; the content
 * column centres (which, being the tallest item, usually just fills the row).
 * Column gaps come from the icon's right and the actions' left margins, so an
 * absent icon or actions collapses cleanly with no leftover gap.
 *
 * Colour comes from `colorPalette`, set per `tone`. The `--banner-text-color`
 * custom property holds the foreground (the tone's `fg.link` by default; the
 * base body colour for `neutral`; a step darker for `caution`) and is applied
 * directly to the title, description, icon, and dismiss — never the content
 * container — so custom children opt in via `var(--banner-text-color)` rather
 * than inheriting it. The dismiss colour resolves through `--banner-dismiss-color`
 * (defaulting to the text colour), which `outline` overrides to black. `fill`
 * uses an opaque s20 tint with a subtle tone border; `outline` sits on an opaque
 * surface with a stronger tone border (the Figma only specs `fill`).
 */
export const styles = sva({
  slots: [
    "root",
    "iconWrap",
    "defaultIcon",
    "message",
    "title",
    "description",
    "trailing",
    "actions",
    "dismiss",
  ],
  base: {
    root: {
      display: "flex",
      alignItems: "center",
      padding: "[12px]",
      borderRadius: "xl",
      border: "1px solid",
      textStyle: "sm",
      "--banner-text-color": "var(--colors-color-palette-fg-link)",
    },
    iconWrap: {
      alignSelf: "flex-start",
      flexShrink: "0",
      display: "flex",
      alignItems: "center",
      minHeight: "[1.6em]",
      // Gap to the content column (widened for large custom icons).
      marginRight: "[8px]",
      color: "var(--banner-text-color)",
    },
    // Hook applied by the component to the tone's default icon only (not named
    // or custom icons); tone variants add per-tone tweaks to it.
    defaultIcon: {},
    message: {
      flex: "1",
      minWidth: "0",
      // Gap between the stacked title / description / custom children.
      "& > * + *": { marginTop: "[1px]" },
    },
    title: {
      margin: "0",
      fontWeight: "semibold",
      color: "var(--banner-text-color)",
    },
    description: {
      color: "var(--banner-text-color)",
    },
    trailing: {
      alignSelf: "flex-start",
      flexShrink: "0",
      display: "flex",
      alignItems: "center",
      gap: "[4px]",
      marginLeft: "[16px]",
    },
    actions: {
      display: "flex",
      alignItems: "center",
      gap: "[8px]",
    },
    // Wraps the dismiss Button. The descendant selector out-specifies the
    // linkSubtle Button's own recipe (they share a cascade layer) so it can
    // square the hit area and colour the × via --banner-dismiss-color (falling
    // back to the tone text colour, forced black on outline) without touching
    // the action buttons.
    dismiss: {
      display: "inline-flex",
      "& button": {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "[24px]",
        height: "[24px]",
        borderRadius: "full",
        color: "var(--banner-dismiss-color, var(--banner-text-color))",
        // Mirror the Button's own hover selector so this out-specifies its
        // default grey link hover (and, like it, leaves a disabled button
        // untouched). The hover colour defaults to a deepened tone colour but
        // can be overridden per tone/variant via --banner-dismiss-hover-color;
        // on outline that mix is a no-op on black, so --banner-dismiss-hover-bg
        // fills the circle via an inset box-shadow (linkSubtle forces
        // `background: none !important`).
        "&:not([aria-disabled=true]):hover": {
          color:
            "[var(--banner-dismiss-hover-color, color-mix(in oklab, var(--banner-dismiss-color, var(--banner-text-color)) 70%, black))]",
          boxShadow:
            "[inset 0 0 0 100px var(--banner-dismiss-hover-bg, transparent)]",
        },
      },
    },
  },
  variants: {
    tone: {
      neutral: {
        root: {
          colorPalette: "neutral",
          // Neutral uses the regular base body text colour, not the link tone.
          "--banner-text-color": "var(--colors-fg-body)",
        },
        defaultIcon: { transform: "[translateY(-0.7px)]" },
      },
      brand: {
        root: { colorPalette: "blue" },
        defaultIcon: { transform: "[translateY(-0.7px)]" },
      },
      error: {
        root: { colorPalette: "red" },
        // The diamond glyph reads smaller than the other tone icons, so enlarge
        // it to 18px.
        iconWrap: { "& > svg": { width: "[18px]", height: "[18px]" } },
        // Correct the enlarged diamond's optical position and deepen its colour
        // a step for extra weight.
        defaultIcon: {
          color: "colorPalette.fg.body",
        },
      },
      caution: {
        root: {
          colorPalette: "orange",
          // A step darker than the s110 link, for legibility on the orange tint.
          "--banner-text-color": "var(--colors-color-palette-fg-body)",
        },
      },
      success: {
        root: { colorPalette: "green" },
        defaultIcon: { transform: "[translateY(-0.7px)]" },
      },
    },
    variant: {
      fill: {
        root: {
          backgroundColor: "colorPalette.bgSolid.surface.active",
          borderColor: "colorPalette.bd.subtle",
        },
      },
      outline: {
        root: {
          backgroundColor: "colorPalette.bgSolid.min",
          borderColor: "colorPalette.bd.solid",
          // The outline dismiss is always black rather than tone-tinted; since
          // black can't deepen on hover, it gets a subtle neutral hover fill.
          "--banner-dismiss-color": "var(--colors-fg-max)",
          "--banner-dismiss-hover-bg": "var(--colors-neutral-a40)",
        },
      },
    },
    // A custom icon component (e.g. an Avatar) gets a wider gap to the content
    // than the compact design-system icons.
    customIcon: {
      true: { iconWrap: { marginRight: "[10px]" } },
    },
  },
  compoundVariants: [
    // Neutral fill: the dismiss × goes fully black on hover, rather than the
    // muted darken the other tones use.
    {
      tone: "neutral",
      variant: "fill",
      css: {
        root: { "--banner-dismiss-hover-color": "var(--colors-fg-max)" },
      },
    },
    // Error, success and brand fill: bump the resting dismiss × a step darker
    // (fg.body) than the tone's link-coloured text so it reads as a distinct
    // control. The hover still deepens from there.
    {
      tone: ["error", "success", "brand"],
      variant: "fill",
      css: {
        root: {
          "--banner-dismiss-color": "var(--colors-color-palette-fg-body)",
        },
      },
    },
  ],
  defaultVariants: {
    tone: "neutral",
    variant: "fill",
  },
});
