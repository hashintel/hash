import { sva } from "@hashintel/ds-helpers/css";

export const bannerTones = [
  "neutral",
  "brand",
  "error",
  "caution",
  "success",
] as const;

export const bannerVariants = ["fill", "fillLight", "outline"] as const;

/**
 * A horizontal inline notice laid out as two nested flex rows: the outer row is
 * the leading icon plus a `rest` layer, and that `rest` layer is itself a row of
 * a content column (title / description / custom children, stacked) and a
 * trailing actions region. The icon and actions align to the top; the content
 * column centres (which, being the tallest item, usually just fills the row).
 * Column gaps come from the icon's right and the actions' left margins, so an
 * absent icon or actions collapses cleanly with no leftover gap.
 *
 * Colour comes from `colorPalette`, set per `tone`. The `--banner-text-color`
 * custom property holds the foreground (the tone's `fg.link` by default; the
 * base body colour for `neutral`; a step darker for `caution`; the white-ish
 * `fg.onSolid` on the solid `fill`, or black on `fill`'s yellow caution) and is
 * applied directly to the title, description, icon, and dismiss — never the
 * content container — so custom children opt in via `var(--banner-text-color)`
 * rather than inheriting it. The dismiss colour resolves through
 * `--banner-dismiss-color` (defaulting to the text colour), which `outline`
 * overrides to black. `fill` is an opaque solid tone fill with white text on a
 * dark step (chromatic tones s110, neutral the near-black s120), except caution,
 * which is a bright mode-stable yellow with black text; its trailing action
 * buttons become a surface pill with the tone colour (or black on caution) as
 * the label, and — bar caution — the fill/text/pill all flip with the theme so
 * the dark-mode light-tint fill stays legible. `fillLight` is the light opaque
 * tint with a subtle tone border; `outline` sits on an opaque surface with a
 * stronger tone border.
 */
export const styles = sva({
  slots: [
    "root",
    "iconWrap",
    "defaultIcon",
    "rest",
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
    // Inner flex layer beside the icon: content column + trailing region. Fills
    // the width left of the icon; `minWidth: 0` lets its content shrink/truncate.
    rest: {
      display: "flex",
      alignItems: "center",
      flex: "1",
      minWidth: "0",
    },
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
        "&:focus-visible": {
          outlineOffset: "[-2px]",
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
      // Opaque solid tone fill with theme-adaptive on-solid text. The per-tone
      // fill colour is supplied as `--banner-solid` by the compound variants
      // below (chromatic s110, neutral the near-black s120, caution a bright
      // yellow — each AA-legible for its text); the border matches the fill, so a
      // solid banner is deliberately borderless.
      fill: {
        root: {
          // `--banner-solid` is the tone's fill colour (set per tone below); it
          // paints the surface and doubles as the action-button label colour.
          // In dark mode every s110/s120 fill flips to a light tint, so the text
          // uses the GLOBAL `fg.onSolid` (white in light, black in dark — not the
          // per-tone one, whose orange value is dark even in light) to stay
          // legible on the fill in both modes.
          backgroundColor: "var(--banner-solid)",
          borderColor: "var(--banner-solid)",
          "--banner-text-color": "var(--colors-fg-on-solid)",
          // The dismiss × matches the banner text (white in light / black in
          // dark) and gains a translucent-white hover highlight, rather than the
          // light variants' darken-toward-black (which would dim it on the fill).
          "--banner-dismiss-hover-color": "var(--colors-fg-on-solid)",
          "--banner-dismiss-hover-bg": "var(--colors-white-a20)",
          // Default `Banner.ActionButton`s (tagged `banner-action-button`; an
          // explicit `variant` opts out) render as light `subtle` Buttons meant
          // for a white page — invisible on a saturated fill. Restyle them (from
          // the root, which carries the variant) as a crisp surface pill with the
          // tone's solid colour as the label, so the label inherits the same
          // AA-clear ratio as the fill. Both the pill (`neutral.s00`) and the
          // label (`--banner-solid`) flip with the theme — white pill + dark
          // label in light, dark pill + light label in dark — staying legible in
          // both. Hover shifts the pill a step; the focus ring is the banner text
          // colour, offset onto the fill so it stands off the pill.
          "& [data-banner-actions] .banner-action-button": {
            backgroundColor: "neutral.s00",
            borderColor: "[transparent]",
            color: "var(--banner-solid)",
            // A white pill can't lighten, so hover shifts it a touch darker and
            // deepens the label toward black — raising contrast on interaction
            // rather than dipping the lowest-headroom tones below AA. (Caution
            // keeps its own lighter hover, set in its compound below.)
            "&:not([aria-disabled=true]):hover": {
              backgroundColor: "neutral.s30",
              color: "[color-mix(in srgb, var(--banner-solid) 80%, black)]",
              borderColor: "[transparent]",
            },
            "&:focus-visible": {
              outlineColor: "var(--banner-text-color)",
              outlineOffset: "[2px]",
            },
          },
        },
        // The dismiss × sits on the fill, so recolour its focus ring to the
        // banner text colour (white on the dark fills, black on caution's
        // yellow); the Button's near-black default is invisible on the fill. The
        // ring is inset (negative offset) so it sits inside the round button
        // rather than bleeding outward onto the fill.
        dismiss: {
          "& button:focus-visible": {
            outlineColor: "var(--banner-text-color)",
          },
        },
      },
      fillLight: {
        root: {
          backgroundColor: "colorPalette.bgSolid.surface.active",
          borderColor: "colorPalette.bd.subtle",
          "--banner-dismiss-hover-bg": "var(--colors-neutral-a30)",
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
    // Solid-fill colour, one per tone, exposed as `--banner-solid` (the base
    // `fill` block paints the surface and the action-button label with it). Each
    // step is chosen so its text clears WCAG AA (≥4.5:1); the palette's own solid
    // step (s90) is too light for white, so chromatic tones step to s110 and
    // neutral to the near-black s120 (matching the solid Button), while caution
    // takes the bright-yellow route below. neutral restates the global onSolid
    // text colour so it beats its body-colour tone text; brand/error/success
    // inherit it from the base `fill` block (which wins over their `fg.link`).
    {
      tone: "neutral",
      variant: "fill",
      css: {
        root: {
          "--banner-solid": "var(--colors-neutral-s120)",
          "--banner-text-color": "var(--colors-fg-on-solid)",
        },
      },
    },
    {
      tone: "brand",
      variant: "fill",
      css: { root: { "--banner-solid": "var(--colors-blue-s110)" } },
    },
    {
      tone: "error",
      variant: "fill",
      css: {
        root: { "--banner-solid": "var(--colors-red-s110)" },
        // The error tone deepens its diamond icon to a dark red (fg.body); on the
        // solid fill that clashes with the white text, so match the icon to the
        // banner text colour instead.
        defaultIcon: { color: "var(--banner-text-color)" },
      },
    },
    {
      tone: "success",
      variant: "fill",
      css: { root: { "--banner-solid": "var(--colors-green-s110)" } },
    },
    // Caution is the one bright, mode-stable fill (a saturated yellow in both
    // themes), so it inverts the solid treatment: black ink (~17:1 on the
    // yellow) instead of white, and a static white action pill with a black
    // label — the theme-flipping `neutral.s00` pill would turn black in dark mode
    // and swallow the label on the still-yellow fill. The black dismiss × gets a
    // translucent-black hover highlight (a white one is invisible on yellow).
    {
      tone: "caution",
      variant: "fill",
      css: {
        root: {
          "--banner-solid": "var(--colors-yellow-s100)",
          "--banner-text-color": "var(--colors-black)",
          "--banner-dismiss-hover-color": "var(--colors-black)",
          "--banner-dismiss-hover-bg": "var(--colors-black-a10)",
          "& [data-banner-actions] .banner-action-button": {
            backgroundColor: "white",
            color: "var(--banner-text-color)",
            "&:not([aria-disabled=true]):hover": {
              backgroundColor: "[color-mix(in srgb, black 6%, white)]",
              color: "var(--banner-text-color)",
            },
          },
        },
      },
    },
    // Neutral fillLight: the dismiss × goes fully black on hover, rather than the
    // muted darken the other tones use.
    {
      tone: "neutral",
      variant: "fillLight",
      css: {
        root: { "--banner-dismiss-hover-color": "var(--colors-fg-max)" },
      },
    },
    // Error, success and brand fillLight: bump the resting dismiss × a step
    // darker (fg.body) than the tone's link-coloured text so it reads as a
    // distinct control. The hover still deepens from there.
    {
      tone: ["error", "success", "brand"],
      variant: "fillLight",
      css: {
        root: {
          "--banner-dismiss-color": "var(--colors-color-palette-fg-body)",
        },
      },
    },
  ],
  defaultVariants: {
    tone: "neutral",
    variant: "fillLight",
  },
});
