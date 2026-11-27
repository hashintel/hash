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
      "&[data-side=bottom]": {
        flexDirection: "column-reverse",
      },
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
      width: "[var(--toast-width, var(--toast-width-default, 356px))]",
      maxWidth: "[calc(100vw - 32px)]",
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
      "&[data-state=closed]": {
        transition:
          "[translate 400ms cubic-bezier(0.06, 0.71, 0.55, 1), scale 400ms cubic-bezier(0.06, 0.71, 0.55, 1), opacity 200ms cubic-bezier(0.06, 0.71, 0.55, 1)]",
      },
      "&[data-sibling][data-overlap]": {
        height: "[var(--height)]",
      },
      "& > *:not([data-ghost])": {
        transition: "[opacity 200ms ease]",
      },
      "&[data-sibling][data-overlap] > *:not([data-ghost])": {
        opacity: "0",
      },
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
      "& > * + *": { marginTop: "[1px]" },
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
      minHeight: "[1lh]",
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
        // The diamond glyph reads smaller than the other tone icons, so enlarge it to 18px.
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
