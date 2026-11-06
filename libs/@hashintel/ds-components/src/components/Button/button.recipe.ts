import { sva } from "@hashintel/ds-helpers/css";

import { formSizes } from "../../util/form-size.recipe";

export const styles = sva({
  slots: [
    "button",
    "loadingContainer",
    "loadingSpinner",
    "loadingContent",
    "iconText",
    "icon",
  ],
  base: {
    button: {
      cursor: "pointer",
      // Keeps the label unselectable inside Drawer, whose content forces
      // user-select: text — a selectable label turns the disabled state's
      // `cursor: auto` into a text caret instead of the default arrow
      userSelect: "none",
      display: "inline-block",
      fontWeight: "medium",
      borderWidth: "var(--form-border-width)",
      borderStyle: "solid",
      borderColor: "[var(--button-border-color)]",
      background: "[var(--button-bg)]",
      "--button-bg": "{colors.neutral.s00}",
      textAlign: "center",
      transition:
        "[background 0.15s ease, color 0.15s ease, border 0.15s ease]",
      paddingY: "var(--form-padding-y)",
      minWidth:
        "[calc(round(var(--form-line-height) * var(--leading-factor, 1), 1px) + var(--form-padding-y) * 2 + var(--form-border-width) * 2)]",
      "&:focus-visible": {
        outlineWidth: "2px",
        outlineStyle: "solid",
      },
      '&[aria-disabled="true"]': {
        cursor: "auto",
      },
    },
    loadingContainer: {
      position: "absolute",
      inset: "0",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    loadingContent: { visibility: "hidden", display: "flex" },
    iconText: {},
  },
  variants: {
    size: {
      xxs: {
        button: {
          ...formSizes.variants.sizes.xxs,
          paddingX: "2",
          borderRadius: "md",
          "--button-icon-margin": "var(--spacing-1)",
        },
      },
      xs: {
        button: {
          ...formSizes.variants.sizes.xs,
          paddingX: "2",
          borderRadius: "md",
          "--button-icon-margin": "var(--spacing-1)",
        },
      },
      sm: {
        button: {
          ...formSizes.variants.sizes.sm,
          paddingX: "2",
          borderRadius: "lg",
          "--button-icon-margin": "var(--spacing-1\\.5)",
        },
      },
      md: {
        button: {
          ...formSizes.variants.sizes.md,
          paddingX: "3",
          borderRadius: "lg",
          "--button-icon-margin": "var(--spacing-2)",
        },
        loadingSpinner: {
          padding: "[2px]",
        },
      },
      lg: {
        button: {
          ...formSizes.variants.sizes.lg,
          paddingX: "4",
          borderRadius: "lg",
          "--button-icon-margin": "var(--spacing-2)",
        },
        // The md icon step (24px) reads oversized in lg buttons. && outranks
        // the Icon recipe's own --icon-size class, which ties on specificity.
        icon: { "&&": { "--icon-size": "20px" } },
      },
    },
    shape: {
      default: {},
      round: { button: { borderRadius: "full" } },
    },
    tone: {
      neutral: {
        button: {
          "&:focus-visible": {
            outlineColor: "black.a60",
          },
        },
      },
      brand: {
        button: {
          "&:focus-visible": {
            outlineColor: "blue.a60",
          },
        },
      },
      error: {
        button: {
          "&:focus-visible": {
            outlineColor: "red.a60",
          },
        },
      },
    },
    variant: {
      solid: {},
      subtle: {},
      ghost: {
        button: {
          background: "[transparent]",
          "--button-border-color": "transparent",
        },
      },
      link: {
        button: {
          display: "inline",
          padding: "0 !important",
          border: "0 !important",
          background: "[none !important]",
          textAlign: "[inherit !important]",
          minWidth: "0 !important",
          fontWeight: "semibold",
          "&:not([aria-disabled=true]):hover": {
            textDecoration: "underline",
          },
          "&:focus-visible": {
            outlineOffset: "0.5",
          },
        },
      },
      linkSubtle: {
        button: {
          display: "inline",
          padding: "0 !important",
          border: "0 !important",
          background: "[none !important]",
          textAlign: "[inherit !important]",
          minWidth: "0 !important",
          fontWeight: "semibold",
          "&:focus-visible": {
            outlineOffset: "0.5",
          },
        },
      },
    },
    isLoading: {
      true: { button: { position: "relative" } },
    },
    hasIcon: {
      true: {
        button: {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        },
      },
    },
    hasIconLeft: {
      true: { iconText: { marginLeft: "var(--button-icon-margin)" } },
    },
    hasIconRight: {
      true: { iconText: { marginRight: "var(--button-icon-margin)" } },
    },
    isDisabled: {
      true: {},
    },
    isPressed: {
      true: {},
    },
    isIconOnly: {
      true: {},
    },
  },
  compoundVariants: [
    // ── Icon-only (square) ──
    {
      size: "xxs",
      isIconOnly: true,
      css: {
        button: { paddingX: "0" },
      },
    },
    {
      size: "xs",
      isIconOnly: true,
      css: {
        button: { paddingX: "0" },
      },
    },
    {
      size: "sm",
      isIconOnly: true,
      css: {
        button: { paddingX: "0.5" },
      },
    },
    {
      size: "md",
      isIconOnly: true,
      css: {
        button: { paddingX: "1" },
      },
    },
    {
      size: "lg",
      isIconOnly: true,
      css: {
        button: { paddingX: "2" },
      },
    },
    // ── Compact sizes: reduce the padding beside an icon/prefix/suffix ──
    {
      size: "xxs",
      hasIconLeft: true,
      isIconOnly: false,
      css: {
        button: { paddingLeft: "1.5" },
      },
    },
    {
      size: "xxs",
      hasIconRight: true,
      isIconOnly: false,
      css: {
        button: { paddingRight: "1.5" },
      },
    },
    {
      size: "xs",
      hasIconLeft: true,
      isIconOnly: false,
      css: {
        button: { paddingLeft: "1.5" },
      },
    },
    {
      size: "xs",
      hasIconRight: true,
      isIconOnly: false,
      css: {
        button: { paddingRight: "1.5" },
      },
    },
    {
      size: "md",
      hasIconLeft: true,
      isIconOnly: false,
      css: {
        button: { paddingLeft: "2.5" },
      },
    },
    {
      size: "md",
      hasIconRight: true,
      isIconOnly: false,
      css: {
        button: { paddingRight: "2.5" },
      },
    },
    {
      size: "lg",
      hasIconLeft: true,
      isIconOnly: false,
      css: {
        button: { paddingLeft: "2.5" },
      },
    },
    {
      size: "lg",
      hasIconRight: true,
      isIconOnly: false,
      css: {
        button: { paddingRight: "2.5" },
      },
    },
    {
      variant: "solid",
      tone: "neutral",
      css: {
        button: {
          "--button-bg": "{colors.neutral.s120}",
          "--button-border-color": "{colors.neutral.s120}",
          color: "fg.onSolid",
          "&:not([aria-disabled=true]):hover": {
            "--button-bg": "{colors.neutral.s110}",
            "--button-border-color": "{colors.neutral.s110}",
          },
        },
      },
    },
    {
      variant: "solid",
      tone: "neutral",
      isPressed: true,
      css: {
        button: {
          "--button-bg": "{colors.neutral.s115}",
          "--button-border-color": "{colors.neutral.s115}",
          boxShadow: "[inset 0 2px 4px rgba(0,0,0,0.35)]",
        },
      },
    },
    {
      variant: "solid",
      tone: "neutral",
      isDisabled: true,
      css: {
        button: {
          color: "neutral.s20",
          "--button-bg": "{colors.neutral.s80}",
          "--button-border-color": "{colors.neutral.s80}",
        },
      },
    },

    // ── Solid + Brand (blue) ──
    {
      variant: "solid",
      tone: "brand",
      css: {
        button: {
          "--button-bg": "{colors.blue.s90}",
          "--button-border-color": "{colors.blue.s90}",
          color: "fg.onSolid",
          "&:not([aria-disabled=true]):hover": {
            "--button-bg": "{colors.blue.s85}",
            "--button-border-color": "{colors.blue.s85}",
          },
        },
      },
    },
    {
      variant: "solid",
      tone: "brand",
      isPressed: true,
      css: {
        button: {
          "--button-bg": "{colors.blue.s95}",
          "--button-border-color": "{colors.blue.s95}",
          boxShadow: "[inset 0 2px 4px rgba(0,0,0,0.15)]",
        },
      },
    },
    {
      variant: "solid",
      tone: "brand",
      isDisabled: true,
      css: {
        button: {
          "--button-bg": "{colors.blue.s60}",
          "--button-border-color": "{colors.blue.s60}",
        },
      },
    },

    // ── Solid + Error (red) ──
    {
      variant: "solid",
      tone: "error",
      css: {
        button: {
          "--button-bg": "{colors.red.s90}",
          "--button-border-color": "{colors.red.s90}",
          color: "fg.onSolid",
          "&:not([aria-disabled=true]):hover": {
            "--button-bg": "{colors.red.s85}",
            "--button-border-color": "{colors.red.s85}",
          },
        },
      },
    },
    {
      variant: "solid",
      tone: "error",
      isPressed: true,
      css: {
        button: {
          "--button-bg": "{colors.red.s95}",
          "--button-border-color": "{colors.red.s95}",
          boxShadow: "[inset 0 2px 4px rgba(0,0,0,0.15)]",
        },
      },
    },
    {
      variant: "solid",
      tone: "error",
      isDisabled: true,
      css: {
        button: {
          "--button-bg": "{colors.red.s60}",
          "--button-border-color": "{colors.red.s60}",
        },
      },
    },
    // ── Subtle (neutral) ──
    {
      variant: "subtle",
      tone: "neutral",
      css: {
        button: {
          background: "neutral.a00",
          "--button-border-color": "{colors.neutral.a60}",
          color: "neutral.s120",
          "&:not([aria-disabled=true]):hover": {
            background: "neutral.a20",
            "--button-bg": "{colors.neutral.s20}",
            "--button-border-color": "{colors.neutral.a80}",
          },
        },
      },
    },
    {
      variant: "subtle",
      tone: "neutral",
      isPressed: true,
      css: {
        button: {
          background: "neutral.a05",
          "--button-bg": "{colors.neutral.s05}",
          color: "neutral.s115",
          boxShadow: "[inset 0 2px 4px rgba(0,0,0,0.05)]",
        },
      },
    },
    {
      variant: "subtle",
      tone: "neutral",
      isDisabled: true,
      css: {
        button: {
          background: "neutral.a20",
          "--button-bg": "{colors.neutral.s20}",
          "--button-border-color": "{colors.neutral.a50}",
          color: "neutral.s80",
        },
      },
    },
    // ── Subtle + Brand ──
    {
      variant: "subtle",
      tone: "brand",
      css: {
        button: {
          background: "blue.a20",
          "--button-bg": "{colors.blue.s20}",
          "--button-border-color": "{colors.blue.a60}",
          color: "blue.s90",
          "&:not([aria-disabled=true]):hover": {
            background: "blue.a30",
            "--button-bg": "{colors.blue.s30}",
            "--button-border-color": "{colors.blue.a70}",
          },
        },
      },
    },
    {
      variant: "subtle",
      tone: "brand",
      isPressed: true,
      css: {
        button: {
          color: "blue.s85",
          background: "blue.a25",
          "--button-bg": "{colors.blue.s25}",
          boxShadow: "[inset 0 2px 4px rgba(0,0,0,0.05)]",
        },
      },
    },
    {
      variant: "subtle",
      tone: "brand",
      isDisabled: true,
      css: {
        button: {
          background: "blue.a20",
          "--button-bg": "{colors.blue.s20}",
          "--button-border-color": "{colors.blue.a40}",
          color: "blue.s70",
        },
      },
    },
    // ── Subtle + Error (red) ──
    {
      variant: "subtle",
      tone: "error",
      css: {
        button: {
          background: "red.a20",
          "--button-bg": "{colors.red.s20}",
          "--button-border-color": "{colors.red.a60}",
          color: "red.s90",
          "&:not([aria-disabled=true]):hover": {
            background: "red.a25",
            "--button-bg": "{colors.red.s25}",
            "--button-border-color": "{colors.red.a70}",
          },
        },
      },
    },
    {
      variant: "subtle",
      tone: "error",
      isPressed: true,
      css: {
        button: {
          color: "red.s85",
          boxShadow: "[inset 0 2px 4px rgba(0,0,0,0.05)]",
        },
      },
    },
    {
      variant: "subtle",
      tone: "error",
      isDisabled: true,
      css: {
        button: {
          background: "red.a15",
          "--button-bg": "{colors.red.s15}",
          "--button-border-color": "{colors.red.a30}",
          color: "red.s70",
        },
      },
    },

    // ── Ghost (neutral) ──
    {
      variant: "ghost",
      tone: "neutral",
      css: {
        button: {
          color: "neutral.s120",
          "&:not([aria-disabled=true]):hover": {
            background: "neutral.a20",
            "--button-bg": "{colors.neutral.s20}",
            "--button-border-color": "{colors.neutral.a60}",
          },
        },
      },
    },
    {
      variant: "ghost",
      tone: "neutral",
      isPressed: true,
      css: {
        button: {
          color: "neutral.s115",
          background: "neutral.a10",
          "--button-bg": "{colors.neutral.s10}",
          "--button-border-color": "{colors.neutral.a50}",
          boxShadow: "[inset 0 2px 4px rgba(0,0,0,0.05)]",
        },
      },
    },
    {
      variant: "ghost",
      tone: "neutral",
      isDisabled: true,
      css: {
        button: {
          color: "neutral.s70",
        },
      },
    },

    // ── Ghost (brand) ──
    {
      variant: "ghost",
      tone: "brand",
      css: {
        button: {
          color: "blue.s105",
          "&:not([aria-disabled=true]):hover": {
            background: "blue.a30",
            "--button-bg": "{colors.blue.s30}",
            "--button-border-color": "{colors.blue.a70}",
          },
        },
      },
    },
    {
      variant: "ghost",
      tone: "brand",
      isPressed: true,
      css: {
        button: {
          color: "blue.s85",
          background: "blue.a25",
          "--button-bg": "{colors.blue.s25}",
          "--button-border-color": "{colors.blue.a50}",
          boxShadow: "[inset 0 2px 4px rgba(0,0,0,0.05)]",
        },
      },
    },
    {
      variant: "ghost",
      tone: "brand",
      isDisabled: true,
      css: {
        button: {
          color: "blue.s70",
        },
      },
    },
    // ── Ghost (error) ──
    {
      variant: "ghost",
      tone: "error",
      css: {
        button: {
          color: "red.s105",
          "&:not([aria-disabled=true]):hover": {
            background: "red.a25",
            "--button-bg": "{colors.red.s25}",
            "--button-border-color": "{colors.red.a70}",
          },
        },
      },
    },
    {
      variant: "ghost",
      tone: "error",
      isPressed: true,
      css: {
        button: {
          color: "red.s85",
          background: "red.a20",
          "--button-bg": "{colors.red.s20}",
          "--button-border-color": "{colors.red.a60}",
          boxShadow: "[inset 0 2px 4px rgba(0,0,0,0.05)]",
        },
      },
    },
    {
      variant: "ghost",
      tone: "error",
      isDisabled: true,
      css: {
        button: {
          color: "red.s70",
        },
      },
    },

    // ── Link ──
    {
      variant: "link",
      isPressed: true,
      css: {
        button: {
          textDecoration: "underline",
        },
      },
    },
    {
      variant: "link",
      isDisabled: true,
      css: {
        button: {
          opacity: 0.4,
        },
      },
    },
    // ── Link (neutral) ──
    {
      variant: "link",
      tone: "neutral",
      css: {
        button: {
          color: "[inherit]",
        },
      },
    },
    // ── Link (brand) ──
    {
      variant: "link",
      tone: "brand",
      css: {
        button: {
          color: "blue.s105",
        },
      },
    },
    // ── Link (error) ──
    {
      variant: "link",
      tone: "error",
      css: {
        button: {
          color: "red.s100",
        },
      },
    },

    // ── Link Subtle ──
    {
      variant: "linkSubtle",
      isDisabled: true,
      css: {
        button: {
          opacity: 0.4,
        },
      },
    },
    // ── Link Subtle (neutral) ──
    {
      variant: "linkSubtle",
      tone: "neutral",
      css: {
        button: {
          color: "neutral.s120",
          "&:not([aria-disabled=true]):hover": {
            color: "neutral.s100",
          },
        },
      },
    },
    {
      variant: "linkSubtle",
      tone: "neutral",
      isPressed: true,
      css: {
        button: {
          color: "neutral.s110",
        },
      },
    },
    // ── Link (brand) ──
    {
      variant: "linkSubtle",
      tone: "brand",
      css: {
        button: {
          color: "blue.s105",
          "&:not([aria-disabled=true]):hover": {
            color: "blue.s80",
          },
        },
      },
    },
    {
      variant: "linkSubtle",
      tone: "brand",
      isPressed: true,
      css: {
        button: {
          color: "blue.s115",
        },
      },
    },
    // ── Link (error) ──
    {
      variant: "linkSubtle",
      tone: "error",
      css: {
        button: {
          color: "red.s100",
          "&:not([aria-disabled=true]):hover": {
            color: "red.s80",
          },
        },
      },
    },
    {
      variant: "linkSubtle",
      tone: "error",
      isPressed: true,
      css: {
        button: {
          color: "red.s115",
        },
      },
    },
    {
      variant: "link",
      size: "md",
      css: {
        button: {
          fontSize: "[inherit !important]",
          lineHeight: "[inherit !important]",
          letterSpacing: "inherit !important",
        },
      },
    },
    {
      variant: "linkSubtle",
      size: "md",
      css: {
        button: {
          fontSize: "[inherit !important]",
          lineHeight: "[inherit !important]",
          letterSpacing: "inherit !important",
        },
      },
    },
  ],
  defaultVariants: {
    size: "md",
    tone: "neutral",
    variant: "solid",
  },
});
