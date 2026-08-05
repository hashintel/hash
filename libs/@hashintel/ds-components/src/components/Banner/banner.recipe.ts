import { sva } from "@hashintel/ds-helpers/css";

export const bannerTones = [
  "neutral",
  "brand",
  "error",
  "caution",
  "success",
] as const;

export const bannerVariants = ["fill", "fillLight", "outline"] as const;

export const styles = sva({
  slots: [
    "root",
    "iconWrap",
    "defaultIcon",
    "content",
    "message",
    "title",
    "description",
    "actions",
    "dismiss",
  ],
  base: {
    root: {
      display: "flex",
      alignItems: "flex-start",
      padding: "[12px]",
      borderRadius: "xl",
      border: "1px solid",
      textStyle: "sm",
      gap: "[4px]",
      // Query container so `content` can respond to the banner's own width.
      containerType: "inline-size",
      containerName: "banner",
      "--banner-text-color": "var(--colors-color-palette-fg-link)",
    },
    iconWrap: {
      flexShrink: "0",
      display: "flex",
      alignItems: "center",
      minHeight: "[1.6em]",
      marginRight: "[4px]",
      color: "var(--banner-text-color)",
    },
    defaultIcon: {},
    // Inner flex layer beside the icon: content column + trailing region. Fills
    // the width left of the icon; `minWidth: 0` lets its content shrink/truncate.
    content: {
      alignSelf: "center",
      display: "flex",
      alignItems: "flex-start",
      flex: "1",
      rowGap: "[8px]",
      columnGap: "[16px]",
      minWidth: "0",
      // Below a 500px banner width, let the actions wrap beneath the message
      // rather than being squeezed into a narrow column beside it.
      "@container banner (max-width: 450px)": {
        flexWrap: "wrap",
      },
    },
    message: {
      flex: "[1 1 auto]",
      alignSelf: "center",
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
    actions: {
      flexShrink: "0",
      display: "flex",
      alignItems: "center",
      gap: "[8px]",
    },
    dismiss: {
      display: "inline-flex",
      alignSelf: "flex-start",
      "& button": {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "[24px]",
        height: "[24px]",
        borderRadius: "full",
        color: "var(--banner-dismiss-color, var(--banner-text-color))",
        // Mirror the Button's own hover selector so this out-specifies its
        // default grey link hover
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
        defaultIcon: {
          color: "colorPalette.fg.body",
        },
      },
      caution: {
        root: {
          colorPalette: "orange",
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
          backgroundColor: "var(--banner-solid)",
          borderColor: "var(--banner-solid)",
          "--banner-text-color": "var(--colors-fg-on-solid)",
          "--banner-dismiss-hover-color": "var(--colors-fg-on-solid)",
          "--banner-dismiss-hover-bg": "var(--colors-white-a20)",
          "& [data-banner-actions] .banner-action-button": {
            backgroundColor: "neutral.s00",
            borderColor: "[transparent]",
            color: "var(--banner-solid)",
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
          "--banner-dismiss-color": "var(--colors-fg-max)",
          "--banner-dismiss-hover-bg": "var(--colors-neutral-a40)",
        },
      },
    },
    // A custom icon component (e.g. an Avatar) gets a wider gap to the content
    // than the compact design-system icons.
    customIcon: {
      true: { iconWrap: { marginRight: "[6px]" } },
    },
  },
  compoundVariants: [
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
        defaultIcon: { color: "var(--banner-text-color)" },
      },
    },
    {
      tone: "success",
      variant: "fill",
      css: { root: { "--banner-solid": "var(--colors-green-s110)" } },
    },
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
    {
      tone: "neutral",
      variant: "fillLight",
      css: {
        root: { "--banner-dismiss-hover-color": "var(--colors-fg-max)" },
      },
    },
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
