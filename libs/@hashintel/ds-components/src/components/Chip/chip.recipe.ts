import { cva, sva } from "@hashintel/ds-helpers/css";

export const chipVariants = ["defined", "soft", "outline", "ghost"] as const;

export const styles = sva({
  slots: ["root", "label", "centerButton"],
  base: {
    root: {
      display: "inline-flex",
      flex: "[0 1 auto]",
      width: "[fit-content]",
      alignItems: "center",
      fontWeight: "medium",
      whiteSpace: "nowrap",
      userSelect: "none",
      // Own the stacking context so the centre's z-index:-1 hover tint paints
      // above the chip's (semi-transparent) bg but still behind the affixes.
      isolation: "isolate",
      overflow: "clip",
      // Extend the clip by the border width so a badge affix's outer ring
      // (which bleeds into the border region) isn't clipped away.
      overflowClipMargin: "[var(--chip-border-width)]",
      outline: "none",
      border: "var(--chip-border-width) solid transparent",
      borderRadius: "[var(--chip-radius)]",
      paddingInlineStart: "var(--chip-padding-x)",
      paddingInlineEnd: "var(--chip-padding-x)",
      "--chip-divider": "var(--colors-color-palette-bd-subtle)",
      "--chip-divider-hover": "var(--colors-color-palette-bd-solid)",
      // Badge divider: matches the chip's border at rest (seamless with the
      // badge's now-visible outer ring), darkening a step further on hover.
      "--chip-badge-divider": "var(--colors-color-palette-bd-solid)",
      "--chip-badge-divider-hover":
        "var(--colors-color-palette-bd-solid-hover)",
      // Hovering the button that owns the badge (the affix, or the clickable root/centre it lives in)
      // swaps in the hover value so an absorbed/whole-chip badge darkens like a standalone one.
      "--chip-badge-bg": "var(--colors-color-palette-bg-solid-min)",
      "--chip-badge-bg-hover":
        "[color-mix(in oklab, currentColor calc(12% + var(--chip-active-boost, 0%)), var(--colors-color-palette-bg-solid-min))]",
      // Softer hover for an *absorbed* badge/angle (shares its button with the label)
      "--chip-badge-bg-hover-soft":
        "[color-mix(in oklab, currentColor calc(8% + var(--chip-active-boost, 0%)), var(--colors-color-palette-bg-solid-min))]",
      // Angle parallelogram tint + hover value. Hovering the button that owns
      // the angle swaps in the hover value so an absorbed/whole-chip angle
      // darkens to the same colour a standalone clickable one gets.
      "--chip-angle-bg": "[color-mix(in oklab, currentColor 12%, transparent)]",
      "--chip-angle-bg-hover":
        "[color-mix(in oklab, currentColor calc(20% + var(--chip-active-boost, 0%)), transparent)]",
      // Absorbed counterpart (cf. `--chip-badge-bg-hover-soft`); the translucent
      // tint composites over the already-darkened label bg, so soften it.
      "--chip-angle-bg-hover-soft":
        "[color-mix(in oklab, currentColor calc(14% + var(--chip-active-boost, 0%)), transparent)]",
      // Thin divider along a separate angle affix's slant, shown on hover.
      // It composites over the constant chip bg.
      "--chip-angle-border": "var(--chip-angle-bg)",
      "--chip-angle-border-hover":
        "[color-mix(in oklab, var(--chip-divider-hover) 95%, transparent)]",
      "--chip-divider-shadow": "[0 0 0 0 transparent]",
      // `--chip-hover-ink` (colour mixed in, currentColor by default) at `--chip-hover-strength`.
      // The translucent `--chip-hover-tint` drives the segments
      "--chip-hover-ink": "[currentColor]",
      "--chip-hover-strength": "12%",
      // Added to every hover-darken amount; 0 at rest, bumped on the root when pressed (see `:active` below)
      "--chip-active-boost": "0%",
      "--chip-hover-tint":
        "[color-mix(in oklab, var(--chip-hover-ink) calc(var(--chip-hover-strength) + var(--chip-active-boost, 0%)), transparent)]",
      // Lighter label-hover tint used only beside an angle affix, so the hovered
      // label/wedge stays lighter than the affix's ~12% parallelogram and the
      // slant keeps its contrast instead of blending in.
      "--chip-hover-tint-soft":
        "[color-mix(in oklab, var(--chip-hover-ink) calc(5% + var(--chip-active-boost, 0%)), transparent)]",
      "--chip-ring-color":
        "[color-mix(in oklab, var(--colors-color-palette-fg-link) 65%, transparent)]",
      "--chip-ring-soft": "[3px]",
      // A segment ring's round outer corner, capped at ~half the chip height. A
      // radii-full chip's ~9999px radius would trigger border-radius
      // overflow-scaling that shrinks even the 3px inner corners toward sharp;
      // the cap keeps a semicircle cap while leaving those 3px corners intact.
      "--chip-ring-cap":
        "[min(var(--chip-radius), calc(0.5lh + var(--chip-padding-y)))]",
      "--chip-ring-start": "var(--chip-ring-soft)",
      "--chip-ring-end": "var(--chip-ring-soft)",
      transition:
        "[background 0.15s ease, color 0.15s ease, border 0.15s ease]",
      "&:focus-visible": {
        boxShadow: "[0 0 0 2px var(--chip-ring-color)]",
      },
      "&:has(:focus-visible)": {
        overflow: "visible",
      },
      "&:is(:active, :has(:active))": {
        "--chip-active-boost": "4%",
      },
      // A segment divider is a box-shadow (reading `--chip-divider`) on the
      // affix/remove button. Darken it when either segment it separates is
      // hovered: the segment itself (or, for an absorbed affix, its hovered
      // centre via inheritance), the centre's later siblings, or a prefix whose
      // following centre is hovered.
      "& [data-chip-segment]:hover": {
        "--chip-divider": "var(--chip-divider-hover)",
        "--chip-badge-divider": "var(--chip-badge-divider-hover)",
      },
      '& [data-chip-segment="center"]:hover ~ [data-chip-segment]': {
        "--chip-divider": "var(--chip-divider-hover)",
        "--chip-badge-divider": "var(--chip-badge-divider-hover)",
        "--chip-angle-border": "var(--chip-angle-border-hover)",
      },
      '& [data-chip-segment="prefix"]:has(~ [data-chip-segment="center"]:hover)':
        {
          "--chip-divider": "var(--chip-divider-hover)",
          "--chip-badge-divider": "var(--chip-badge-divider-hover)",
          "--chip-angle-border": "var(--chip-angle-border-hover)",
        },
      // The angle divider only separates a *separate* (interactive) affix from
      // the label, so set it on a hovered prefix/suffix — not the centre, whose
      // angle is connected inside it. Scoped to `button` so a non-interactive
      // (absorbed) angle affix, which carries `data-chip-segment` too, never
      // reveals a slant strip on direct hover.
      '& button[data-chip-segment="prefix"]:hover, & button[data-chip-segment="suffix"]:hover':
        {
          "--chip-angle-border": "var(--chip-angle-border-hover)",
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
      position: "relative",
      cursor: "pointer",
      appearance: "none",
      border: "none",
      background: "[transparent]",
      color: "[inherit]",
      font: "inherit",
      outline: "none",
      paddingInline: "var(--chip-padding-x)",
      "--chip-under-start": "[0px]",
      "--chip-under-end": "[0px]",
      "--chip-clip-start": "[0px]",
      "--chip-clip-end": "[0px]",
      "--chip-under-tint": "var(--chip-hover-tint)",
      // The hover tint lives on a ::before (not the button bg) so it can underlap
      // an adjacent interactive badge/angle affix (via the --chip-under-* insets)
      // and paint behind it (z-index -1), filling the affix's rounded/slanted gap
      // beside the label while the affix's opaque badge covers its own area. For
      // an angle affix the --chip-clip-* insets slant the ::before's matching edge
      // so the tint fills only the wedge and never bleeds under the parallelogram.
      "&::before": {
        content: '""',
        position: "absolute",
        top: "0",
        bottom: "0",
        left: "[calc(-1 * var(--chip-under-start))]",
        right: "[calc(-1 * var(--chip-under-end))]",
        zIndex: "[-1]",
        clipPath:
          "[polygon(var(--chip-clip-start) 0, 100% 0, calc(100% - var(--chip-clip-end)) 100%, 0 100%)]",
        background: "var(--chip-under-tint)",
        opacity: "0",
        transition: "[opacity 0.15s ease]",
        pointerEvents: "none",
      },
      "&:hover::before": {
        opacity: "[1]",
      },
      // Darken an absorbed badge/angle affix
      "&:hover": {
        "--chip-badge-bg": "var(--chip-badge-bg-hover-soft)",
        "--chip-badge-divider": "var(--chip-badge-divider-hover)",
        "--chip-angle-bg": "var(--chip-angle-bg-hover-soft)",
      },
      // Raise the ring (the ::after) over sibling affixes so it paints above e.g. a badge's opaque bg.
      "&:focus-visible::after": {
        content: '""',
        position: "absolute",
        inset: "0",
        zIndex: "[1]",
        borderRadius:
          "[var(--chip-ring-start) var(--chip-ring-end) var(--chip-ring-end) var(--chip-ring-start)]",
        boxShadow: "[0 0 0 2px var(--chip-ring-color)]",
        pointerEvents: "none",
      },
    },
  },
  variants: {
    size: {
      xxs: {
        root: {
          fontSize: "xxs",
          lineHeight: "[1.2]",
          "--chip-border-width": "1px",
          "--chip-padding-y": "[0px]",
          "--chip-padding-x": "var(--spacing-0\\.5)",
          "--chip-radius": "var(--radii-sm)",
        },
      },
      xs: {
        root: {
          fontSize: "xxs",
          lineHeight: "[1.4]",
          "--chip-border-width": "1px",
          "--chip-padding-y": "[0px]",
          "--chip-padding-x": "var(--spacing-1)",
          "--chip-radius": "5px",
        },
      },
      sm: {
        root: {
          fontSize: "xxs",
          lineHeight: "[1.5]",
          "--chip-border-width": "1px",
          "--chip-padding-y": "[0.5px]",
          "--chip-padding-x": "var(--spacing-1)",
          "--chip-radius": "5px",
        },
      },
      md: {
        root: {
          fontSize: "xs",
          lineHeight: "[1.5]",
          "--chip-border-width": "1px",
          "--chip-padding-y": "[1px]",
          "--chip-padding-x": "var(--spacing-1)",
          "--chip-radius": "var(--radii-md)",
        },
      },
      lg: {
        root: {
          fontSize: "sm",
          lineHeight: "[1.5]",
          "--chip-border-width": "1px",
          "--chip-padding-y": "[1.5px]",
          "--chip-padding-x": "var(--spacing-1\\.5)",
          "--chip-radius": "var(--radii-md)",
        },
      },
      xl: {
        root: {
          fontSize: "base",
          lineHeight: "[1.5]",
          "--chip-border-width": "1px",
          "--chip-padding-y": "[2px]",
          "--chip-padding-x": "var(--spacing-2)",
          "--chip-radius": "7px",
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
    },
    variant: {
      defined: {
        root: {
          background: "colorPalette.bgSolid.subtle",
          borderColor: "colorPalette.bd.solid",
          color: "colorPalette.fg.link",
        },
      },
      soft: {
        root: {
          background: "colorPalette.bgSolid.surface.active",
          borderColor: "colorPalette.bd.subtle",
          color: "colorPalette.fg.link",
        },
      },
      outline: {
        root: {
          background: "white",
          borderColor: "colorPalette.bd.subtle.hover",
          color: "colorPalette.fg.link",
          "--chip-hover-strength": "9%",
        },
      },
      // Identical to soft but invisible at rest: unless hovered or focused,
      // the fill, main border and any straight-affix dividers all go transparent.
      ghost: {
        root: {
          background: "colorPalette.bgSolid.surface.active",
          borderColor: "colorPalette.bd.subtle",
          color: "colorPalette.fg.link",
          "&:not(:hover):not(:focus-visible):not(:has(:focus-visible))": {
            background: "[transparent]",
            borderColor: "[transparent]",
            "--chip-divider": "[transparent]",
          },
        },
      },
    },
    // `round` is declared after `size` so it wins the border-radius cascade.
    shape: {
      default: {},
      round: {
        root: { borderRadius: "full", "--chip-radius": "var(--radii-full)" },
      },
    },
    clickable: {
      // The whole chip is one button: hovering it darkens its straight dividers
      // and any badge/angle affix it contains — the badge/angle fills soften
      // (`-soft`) vs standalone, since the chip bg darkens too. No angle border:
      // those angles all connect to the label inside.
      true: {
        root: {
          cursor: "pointer",
          _hover: {
            "--chip-divider": "var(--chip-divider-hover)",
            "--chip-badge-bg": "var(--chip-badge-bg-hover-soft)",
            "--chip-badge-divider": "var(--chip-badge-divider-hover)",
            "--chip-angle-bg": "var(--chip-angle-bg-hover-soft)",
          },
        },
      },
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
    // Round the centre button's outer corners on an edge it owns (no interactive
    // affix between it and that edge), so its box-shadow focus ring follows the
    // chip's rounded end there.
    centerRoundStart: {
      true: { centerButton: { "--chip-ring-start": "var(--chip-ring-cap)" } },
    },
    centerRoundEnd: {
      true: { centerButton: { "--chip-ring-end": "var(--chip-ring-cap)" } },
    },
    // Underlap the label's hover tint beneath an adjacent interactive badge/angle
    // affix to fill its rounded/slanted gap. Only for a separate (interactive)
    // bleeding affix — an absorbed one already sits over the centre's own tint.
    centerUnderStart: {
      true: { centerButton: { "--chip-under-start": "[0.5em]" } },
    },
    centerUnderEnd: {
      true: { centerButton: { "--chip-under-end": "[0.5em]" } },
    },
    // For an angle affix (not a badge), also slant the underlap's matching edge
    // so the tint stops at the slant instead of bleeding under it, and lighten
    // the label/wedge tint so it stays distinct from the parallelogram.
    centerAngleStart: {
      true: {
        centerButton: {
          "--chip-clip-start": "var(--chip-under-start)",
          "--chip-under-tint": "var(--chip-hover-tint-soft)",
        },
      },
    },
    centerAngleEnd: {
      true: {
        centerButton: {
          "--chip-clip-end": "var(--chip-under-end)",
          "--chip-under-tint": "var(--chip-hover-tint-soft)",
        },
      },
    },
  },
  compoundVariants: [
    // The clickable-root hover composites the shared hover mix opaquely over the
    // variant's resting bg — the same colour the segments reach by layering the
    // translucent `--chip-hover-tint`. `defined`/`soft` restate their resting
    // token in the mix (there's no way to read "current bg"); `outline` rests on
    // opaque white, so it mixes over `--colors-white`; `ghost` mirrors soft.
    // These mixes stay `in srgb` (unlike the oklab mixes elsewhere): the browser
    // alpha-composites in srgb, so only srgb here matches the segments' colour.
    {
      clickable: true,
      variant: "defined",
      css: {
        root: {
          _hover: {
            background:
              "[color-mix(in srgb, var(--chip-hover-ink) calc(var(--chip-hover-strength) + var(--chip-active-boost, 0%)), var(--colors-color-palette-bg-solid-subtle))]",
            borderColor: "colorPalette.bd.solid.hover",
          },
        },
      },
    },
    {
      clickable: true,
      variant: ["soft", "ghost"],
      css: {
        root: {
          _hover: {
            background:
              "[color-mix(in srgb, var(--chip-hover-ink) calc(var(--chip-hover-strength) + var(--chip-active-boost, 0%)), var(--colors-color-palette-bg-solid-surface-active))]",
          },
        },
      },
    },
    {
      clickable: true,
      variant: "outline",
      css: {
        root: {
          _hover: {
            background:
              "[color-mix(in srgb, var(--chip-hover-ink) calc(var(--chip-hover-strength) + var(--chip-active-boost, 0%)), var(--colors-white))]",
            borderColor: "colorPalette.bd.solid",
          },
        },
      },
    },
    {
      color: "yellow",
      variant: ["soft", "ghost"],
      css: {
        root: {
          borderColor: "colorPalette.bd.subtle.hover",
          "--chip-hover-ink": "var(--colors-yellow-s90)",
          "--chip-hover-strength": "25%",
        },
      },
    },
    {
      color: "yellow",
      variant: "outline",
      css: {
        root: {
          "--chip-hover-ink": "var(--colors-yellow-s90)",
          "--chip-hover-strength": "12%",
        },
      },
    },
  ],
  defaultVariants: {
    size: "md",
    color: "grey",
    variant: "defined",
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
    // The affix's only box-shadow is its (optional) divider, set per
    // treatment/side via the inherited `--chip-divider-shadow`. The focus ring
    // is a separate `::after` on interactive affixes.
    boxShadow: "[var(--chip-divider-shadow)]",
  },
  variants: {
    treatment: {
      naked: {
        alignSelf: "stretch",
      },
      straight: {
        alignSelf: "stretch",
      },
      // The parallelogram tint lives on a ::before (clip-path per side) so the
      // box — and the focus-ring ::after on an interactive affix — stay
      // un-clipped (a clip-path on the button itself would clip the ring away).
      // isolation + z-index:-1 keep the tint behind the icon but above the chip
      // bg. The ::after is a thin 1px divider along the slant, shown via
      // --chip-angle-border on hover; on an interactive affix it doubles as the
      // focus ring, so :focus-visible drops the strip clip/bg (below) to reveal it.
      angle: {
        alignSelf: "stretch",
        paddingInline: "var(--chip-padding-x)",
        marginBlock: "[calc(-1 * var(--chip-border-width))]",
        position: "relative",
        isolation: "isolate",
        "&::before": {
          content: '""',
          position: "absolute",
          inset: "0",
          zIndex: "[-1]",
          backgroundColor: "var(--chip-angle-bg)",
        },
        "&::after": {
          content: '""',
          position: "absolute",
          inset: "0",
          zIndex: "[-1]",
          backgroundColor: "var(--chip-angle-border)",
          pointerEvents: "none",
        },
      },
      // A brighter (`bgSolid.min`) segment bleeding to the chip edge, inheriting
      // the chip's border-radius so its outer corners match (fully round on
      // `round`, small radius on `default`). A box-shadow ring borders its inner
      // edge and survives the button reset; `overflow: clip` on the root keeps
      // the outer corners aligned. Per-side border-width bleed is in compounds.
      badge: {
        alignSelf: "stretch",
        borderRadius: "[var(--chip-radius)]",
        paddingInline: "[0.75em]",
        marginBlock: "[calc(-1 * var(--chip-border-width))]",
        backgroundColor:
          "[var(--chip-badge-bg, var(--colors-color-palette-bg-solid-min))]",
        // Match the root's hover transition so a badge in a clickable root/centre
        // fades its fill and ring in sync with the label bg rather than snapping.
        transition: "[background-color 0.15s ease, box-shadow 0.15s ease]",
        "--chip-divider-shadow": "[inset 0 0 0 1px var(--chip-badge-divider)]",
        // The badge is rounded on every corner, so its ring is too.
        "--chip-ring-start": "var(--chip-ring-cap)",
        "--chip-ring-end": "var(--chip-ring-cap)",
      },
    },
    side: {
      // The affix sits at the chip edge on its side, so its focus ring rounds to
      // the chip radius there; the inner edge keeps the soft radius.
      prefix: { "--chip-ring-start": "var(--chip-ring-cap)" },
      suffix: { "--chip-ring-end": "var(--chip-ring-cap)" },
    },
    interactive: {
      true: {
        cursor: "pointer",
        appearance: "none",
        font: "inherit",
        color: "[inherit]",
        border: "none",
        outline: "none",
        position: "relative",
        _hover: {
          backgroundColor: "var(--chip-hover-tint)",
        },
        "&:focus-visible": {
          zIndex: "[1]",
        },
        "&:focus-visible::after": {
          content: '""',
          position: "absolute",
          inset: "0",
          borderRadius:
            "[var(--chip-ring-start) var(--chip-ring-end) var(--chip-ring-end) var(--chip-ring-start)]",
          boxShadow: "[0 0 0 2px var(--chip-ring-color)]",
          pointerEvents: "none",
        },
      },
    },
  },
  compoundVariants: [
    {
      treatment: "naked",
      side: "prefix",
      css: {
        paddingInlineStart: "var(--chip-padding-x)",
        paddingInlineEnd: "var(--chip-padding-x)",
      },
    },
    {
      treatment: "naked",
      side: "suffix",
      css: {
        paddingInlineStart: "var(--chip-padding-x)",
        paddingInlineEnd: "var(--chip-padding-x)",
      },
    },
    {
      treatment: "straight",
      side: "prefix",
      css: {
        paddingInlineStart: "var(--chip-padding-x)",
        paddingInlineEnd: "var(--chip-padding-x)",
        "--chip-divider-shadow": "[inset -1px 0 0 0 var(--chip-divider)]",
      },
    },
    {
      treatment: "straight",
      side: "suffix",
      css: {
        paddingInlineStart: "var(--chip-padding-x)",
        paddingInlineEnd: "var(--chip-padding-x)",
        "--chip-divider-shadow": "[inset 1px 0 0 0 var(--chip-divider)]",
      },
    },
    // Straight affix hover: fill with the tint but leave the 1px divider strip
    // untinted (hard-stop gradient), so it matches the divider over the chip bg.
    {
      treatment: "straight",
      side: "prefix",
      interactive: true,
      css: {
        _hover: {
          backgroundColor: "[transparent]",
          backgroundImage:
            "[linear-gradient(to left, transparent 1px, var(--chip-hover-tint) 1px)]",
        },
      },
    },
    {
      treatment: "straight",
      side: "suffix",
      interactive: true,
      css: {
        _hover: {
          backgroundColor: "[transparent]",
          backgroundImage:
            "[linear-gradient(to right, transparent 1px, var(--chip-hover-tint) 1px)]",
        },
      },
    },
    {
      treatment: "badge",
      side: "prefix",
      css: {
        marginInlineStart: "[calc(-1 * var(--chip-border-width))]",
      },
    },
    {
      treatment: "badge",
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
        // Stop the fill 1px short of the slant, leaving that 1px to the strip.
        "&::before": {
          clipPath:
            "[polygon(0 0, calc(100% - 1px) 0, calc(100% - 0.5em - 1px) 100%, 0 100%)]",
        },
        // 1px strip hugging the fill's slant edge, over the chip bg (see `--chip-angle-border`).
        "&::after": {
          clipPath:
            "[polygon(calc(100% - 1px) 0, 100% 0, calc(100% - 0.5em) 100%, calc(100% - 0.5em - 1px) 100%)]",
        },
      },
    },
    {
      treatment: "angle",
      side: "suffix",
      css: {
        marginInlineEnd: "[calc(-1 * var(--chip-border-width))]",
        paddingInlineStart: "[calc(var(--chip-padding-x) + 0.5em)]",
        // Stop the fill 1px short of the slant, leaving that 1px to the strip.
        "&::before": {
          clipPath:
            "[polygon(calc(0.5em + 1px) 0, 100% 0, 100% 100%, 1px 100%)]",
        },
        "&::after": {
          clipPath: "[polygon(0.5em 0, calc(0.5em + 1px) 0, 1px 100%, 0 100%)]",
        },
      },
    },
    // Angle already carries a static ~12% tint, so deepen the parallelogram to
    // the hover tint when clickable (the generic hover tint would be a no-op).
    {
      treatment: "angle",
      interactive: true,
      css: {
        // Keep the box transparent (the generic hover would tint the whole
        // rectangle, incl. the wedge); darken only the parallelogram.
        _hover: {
          backgroundColor: "[transparent]",
          "--chip-angle-bg": "var(--chip-angle-bg-hover)",
        },
        // The ::after doubles as the focus ring here; drop the slant strip's
        // clip/bg on focus so the ring paints as a full un-clipped box.
        "&:focus-visible::after": {
          clipPath: "[none]",
          backgroundColor: "[transparent]",
        },
      },
    },
    // The badge is opaque; darken it in place via `--chip-badge-bg-hover` (an
    // opaque mix) rather than the translucent generic tint, which would let the
    // chip background show through the badge.
    {
      treatment: "badge",
      interactive: true,
      css: {
        // Set backgroundColor directly (not via --chip-badge-bg) so it beats the
        // generic interactive hover's translucent tint on the same property.
        _hover: {
          backgroundColor: "[var(--chip-badge-bg-hover)]",
        },
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
      xl: { width: "[10px]", height: "[10px]" },
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
