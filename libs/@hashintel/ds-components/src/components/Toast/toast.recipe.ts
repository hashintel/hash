import { sva } from "@hashintel/ds-helpers/css";

export const toastTones = [
  "neutral",
  "brand",
  "error",
  "warning",
  "success",
] as const;

export const toastVariants = ["solid", "soft", "outline"] as const;

export type ToastVariant = (typeof toastVariants)[number];

/**
 * The tone × variant system mirrors Banner's (same tones, same
 * solid/soft/outline treatments, `--toast-*` custom properties in place of
 * `--banner-*`). Placement, stacking, and per-toast motion are driven by the
 * CSS custom properties zag's toast machine sets inline (`--x`, `--y`,
 * `--scale`, `--opacity`, `--height`, `--z-index`); the root styles only
 * consume them and define how changes to them transition.
 */
export const styles = sva({
  slots: [
    "shell",
    "group",
    "root",
    "content",
    "titleRow",
    "icon",
    "defaultIcon",
    "title",
    "body",
    "actions",
    "closeTrigger",
  ],
  base: {
    // The region's scroll shell (see `ToasterRegion`): full-viewport and
    // pointer-transparent — zag re-enables pointer events per toast inline,
    // `auto` while visible and `none` while exiting — with its `transform`
    // making it the containing block zag's fixed group positions and scrolls
    // within.
    shell: {
      position: "fixed",
      inset: "0",
      // zag's MAX_Z_INDEX, which the group inside sets inline.
      zIndex: "[2147483647]",
      pointerEvents: "none",
      transform: "[translateZ(0)]",
      display: "flex",
      flexDirection: "column",
      overflowY: "auto",
      scrollbarWidth: "[none]",
      overscrollBehavior: "contain",
      // Bottom stacks grow upward, so reverse the column: scrollable overflow
      // then extends block-start-ward and the resting scroll sits at the
      // bottom, on the front toast.
      "&[data-side=bottom]": {
        flexDirection: "column-reverse",
      },
      // While a stack is expanded, a spacer provides the scroll extent of the
      // measured toast column plus the region's 1rem viewport offsets.
      "&:has([data-part=root][data-stack])::after": {
        content: '""',
        flexShrink: "0",
        width: "[1px]",
        height: "[calc(var(--column-height, 0px) + 2rem)]",
      },
    },
    group: {},
    root: {
      display: "flex",
      alignItems: "flex-start",
      gap: "[8px]",
      // Read through a custom property so a consumer `className` can set a
      // custom width deterministically (a plain `width` override would tie
      // with this one on specificity and fall to stylesheet order).
      width: "[var(--toast-width, var(--toast-width-default, 356px))]",
      maxWidth: "[calc(100vw - 32px)]",
      // The centered edge placements read better slightly wider than the
      // corner stacks.
      "&:is([data-placement=top], [data-placement=bottom])": {
        "--toast-width-default": "[450px]",
      },
      borderRadius: "xl",
      borderWidth: "1px",
      borderStyle: "solid",
      boxShadow:
        "[0 0 0 1px rgba(0, 0, 0, 0.03), 0 4px 12px -4px rgba(0, 0, 0, 0.12), 0 12px 28px -8px rgba(0, 0, 0, 0.14)]",
      textStyle: "sm",
      overflowWrap: "anywhere",
      "--toast-text-color": "var(--colors-fg-body)",
      translate: "[var(--x) var(--y)]",
      scale: "[var(--scale, 1)]",
      opacity: "[var(--opacity)]",
      zIndex: "[var(--z-index)]",
      willChange: "[translate, opacity, scale]",
      transition:
        "[translate 400ms cubic-bezier(0.21, 1.02, 0.73, 1), scale 400ms cubic-bezier(0.21, 1.02, 0.73, 1), opacity 400ms cubic-bezier(0.21, 1.02, 0.73, 1)]",
      // The exit fades out within the store's 200ms `removeDelay` (see
      // `createToaster`), so the toast is fully transparent when zag unmounts
      // it and the longer translate/scale tail is never visibly clipped.
      "&[data-state=closed]": {
        transition:
          "[translate 400ms cubic-bezier(0.06, 0.71, 0.55, 1), scale 400ms cubic-bezier(0.06, 0.71, 0.55, 1), opacity 200ms cubic-bezier(0.06, 0.71, 0.55, 1)]",
      },
      // While overlapped behind the frontmost toast, clamp to the frontmost
      // toast's measured height so the collapsed deck reads as even cards, and
      // hide the content so only clean card edges peek out; it fades back in
      // when hovering expands the stack. Height stays unclamped everywhere
      // else — zag measures it rounded to whole pixels, and applying that to
      // the visible toast nudges its height on hover. The zag-rendered ghost
      // divs must stay hit-testable.
      "&[data-sibling][data-overlap]": {
        height: "[var(--height)]",
      },
      "& > *:not([data-ghost])": {
        transition: "[opacity 200ms ease]",
      },
      "&[data-sibling][data-overlap] > *:not([data-ghost])": {
        opacity: "0",
      },
      // Beyond the collapsed deck of three (`data-deck-hidden`, set from the
      // stack index): fully hidden — `visibility` also drops hit-testing and
      // tab order — until the stack expands or the toast advances into the
      // deck. Pinned just behind the third card (overriding the per-index
      // lift and scale) so deep stacks neither leave phantom scroll extent in
      // the shell nor fade in from far away. Hiding delays `visibility` so
      // the card fades out first; revealing flips it instantly and fades in
      // through the base transition.
      "&[data-deck-hidden][data-overlap]": {
        opacity: "0",
        visibility: "hidden",
        translate: "[var(--x) calc(var(--lift-amount) * 3)]",
        scale: "[0.85]",
        transition:
          "[translate 400ms cubic-bezier(0.21, 1.02, 0.73, 1), scale 400ms cubic-bezier(0.21, 1.02, 0.73, 1), opacity 400ms cubic-bezier(0.21, 1.02, 0.73, 1), visibility 0s linear 400ms]",
        _motionReduce: {
          transition: "[opacity 150ms ease, visibility 0s linear 150ms]",
        },
      },
      _motionReduce: {
        transition: "[opacity 150ms ease]",
      },
    },
    content: {
      flex: "1",
      alignSelf: "center",
      minWidth: "0",
      // Gap between the stacked title row / body / custom children.
      "& > * + *": { marginTop: "[1px]" },
      // Without a body, the title and actions share a line when they fit (the
      // title grows, pushing the actions to the trailing edge) and the actions
      // wrap beneath it when they don't.
      "&:not(:has([data-part=description]))": {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        columnGap: "[16px]",
        rowGap: "[4px]",
        "& > :first-child": { flexGrow: "1" },
        "& > * + *": { marginTop: "0" },
        "& > [data-toast-actions]": { paddingTop: "0" },
      },
    },
    titleRow: {
      display: "flex",
      alignItems: "flex-start",
      gap: "[6px]",
    },
    icon: {
      flexShrink: "0",
      display: "flex",
      alignItems: "center",
      minHeight: "[1.6em]",
      color: "var(--toast-icon-color, var(--toast-text-color))",
    },
    defaultIcon: {},
    title: {
      margin: "0",
      fontWeight: "semibold",
      color: "var(--toast-text-color)",
      alignSelf: "center",
    },
    body: {
      color: "var(--toast-text-color)",
    },
    actions: {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: "[8px]",
      paddingTop: "[12px]",
    },
    closeTrigger: {
      flexShrink: "0",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "[24px]",
      height: "[24px]",
      marginTop: "[-4px]",
      marginRight: "[-4px]",
      // Single-line toasts center the trigger on their one line instead of
      // nudging it into the top corner (measured by ToastContent).
      "&[data-single-line]": {
        alignSelf: "center",
        marginTop: "0",
      },
      borderRadius: "full",
      cursor: "pointer",
      color: "var(--toast-dismiss-color, var(--toast-text-color))",
      transition: "[background 0.15s ease, color 0.15s ease]",
      _hover: {
        color:
          "[var(--toast-dismiss-hover-color, color-mix(in oklab, var(--toast-dismiss-color, var(--toast-text-color)) 70%, black))]",
        backgroundColor: "var(--toast-dismiss-hover-bg, transparent)",
      },
      _focusVisible: {
        outlineWidth: "2px",
        outlineStyle: "solid",
        outlineOffset: "[-2px]",
      },
    },
  },
  variants: {
    // Tones pick the palette; `--toast-tone-icon-color` overrides the icon
    // tint the soft/outline variants apply (the warning and error link colors
    // read too light for their glyphs). Only the tone axis writes it, and only
    // the variant axis writes `--toast-icon-color`, so the two never race.
    tone: {
      neutral: {
        root: { colorPalette: "neutral" },
        defaultIcon: { transform: "[translateY(-0.7px)]" },
      },
      brand: {
        root: { colorPalette: "blue" },
        defaultIcon: { transform: "[translateY(-0.7px)]" },
      },
      error: {
        root: {
          colorPalette: "red",
          "--toast-tone-icon-color": "var(--colors-color-palette-fg-body)",
        },
        // The diamond glyph reads smaller than the other tone icons, so enlarge
        // it to 18px (mirroring Banner).
        defaultIcon: {
          width: "[18px !important]",
          height: "[18px !important]",
        },
      },
      warning: {
        root: {
          colorPalette: "orange",
          "--toast-tone-icon-color": "var(--colors-color-palette-fg-body)",
        },
      },
      success: {
        root: { colorPalette: "green" },
        defaultIcon: { transform: "[translateY(-0.7px)]" },
      },
    },
    variant: {
      solid: {
        root: {
          backgroundColor: "var(--toast-solid)",
          borderColor: "var(--toast-solid)",
          "--toast-text-color": "var(--colors-fg-on-solid)",
          "--toast-dismiss-hover-color": "var(--colors-fg-on-solid)",
          "--toast-dismiss-hover-bg": "var(--colors-white-a20)",
          // Restyle default (subtle) `Toast.Action`s to read on the fill.
          "& [data-toast-actions] .toast-action-button": {
            backgroundColor: "white",
            borderColor: "[transparent]",
            color: "fg.body",
            "&:not([aria-disabled=true]):hover": {
              backgroundColor: "neutral.s30",
              color: "fg.body",
              borderColor: "[transparent]",
            },
            "&:focus-visible": {
              outlineColor: "var(--toast-text-color)",
              outlineOffset: "[2px]",
            },
          },
        },
        closeTrigger: {
          _focusVisible: {
            outlineColor: "var(--toast-text-color)",
          },
        },
      },
      soft: {
        root: {
          backgroundColor: "colorPalette.bgSolid.surface.active",
          borderColor: "colorPalette.bd.subtle",
          "--toast-icon-color":
            "var(--toast-tone-icon-color, var(--colors-color-palette-fg-link))",
          "--toast-dismiss-hover-bg": "var(--colors-neutral-a30)",
          // Default (subtle) `Toast.Action`s blend into the tinted surface, so
          // lift them onto a white background.
          "& [data-toast-actions] .toast-action-button": {
            backgroundColor: "white",
            color: "fg.body",
            "&:not([aria-disabled=true]):hover": {
              backgroundColor: "neutral.s20",
              color: "fg.body",
            },
          },
        },
      },
      outline: {
        root: {
          backgroundColor: "colorPalette.bgSolid.min",
          borderColor: "colorPalette.bd.solid",
          "--toast-icon-color":
            "var(--toast-tone-icon-color, var(--colors-color-palette-fg-link))",
          "--toast-dismiss-color": "var(--colors-fg-max)",
          "--toast-dismiss-hover-bg": "var(--colors-neutral-a40)",
        },
      },
    },
    withPadding: {
      true: {
        root: { padding: "[12px]" },
      },
      false: {
        // The close trigger's negative margins exist to optically inset it
        // within the padding; without padding they push it over the edge.
        closeTrigger: {
          marginTop: "0",
          marginRight: "0",
        },
      },
    },
  },
  compoundVariants: [
    {
      tone: "neutral",
      variant: "solid",
      css: {
        root: { "--toast-solid": "var(--colors-neutral-s120)" },
      },
    },
    {
      tone: "brand",
      variant: "solid",
      css: { root: { "--toast-solid": "var(--colors-blue-s110)" } },
    },
    {
      tone: "error",
      variant: "solid",
      css: { root: { "--toast-solid": "var(--colors-red-s110)" } },
    },
    {
      tone: "success",
      variant: "solid",
      css: { root: { "--toast-solid": "var(--colors-green-s110)" } },
    },
    {
      tone: "warning",
      variant: "solid",
      css: {
        root: {
          "--toast-solid": "var(--colors-yellow-s100)",
          "--toast-text-color": "var(--colors-yellow-fg-on-solid)",
          "--toast-dismiss-hover-color": "var(--colors-yellow-fg-on-solid)",
          "--toast-dismiss-hover-bg": "[rgba(0, 0, 0, 0.05)]",
        },
      },
    },
    {
      tone: "neutral",
      variant: "soft",
      css: {
        root: { "--toast-dismiss-hover-color": "var(--colors-fg-max)" },
      },
    },
  ],
  defaultVariants: {
    tone: "neutral",
    variant: "soft",
    withPadding: true,
  },
});
