import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["button", "loadingContainer", "loadingContent", "iconText"],
  base: {
    button: {
      cursor: "pointer",
      display: "inline-block",
      border: "1px solid",
      transition:
        "[background 0.15s ease, color 0.15s ease, border 0.15s ease]",
      "&:focus-visible": {
        outline: "2px solid",
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
    loadingContent: { visibility: "hidden" },
    iconText: {},
  },
  variants: {
    size: {
      xs: {
        button: {
          paddingX: "2",
          paddingY: "0",
          borderRadius: "md",
          textStyle: "xs",
          minWidth: `[calc(1em * ${1.6} * var(--leading-factor, 1) + 2px)]`,
        },
      },
      sm: {
        button: {
          paddingX: "2",
          paddingY: "0.5",
          borderRadius: "lg",
          textStyle: "sm",
          minWidth: `[calc(1em * ${1.6} * var(--leading-factor, 1) + var(--spacing-0\\.5) * 2 + 2px)]`,
        },
      },
      md: {
        button: {
          paddingX: "3",
          paddingY: "1",
          borderRadius: "lg",
          textStyle: "base",
          minWidth: `[calc(1em * ${1.5} * var(--leading-factor, 1) + var(--spacing-1) * 2 + 2px)]`,
        },
      },
      lg: {
        button: {
          paddingX: "4",
          paddingY: "2",
          borderRadius: "lg",
          textStyle: "base",
          minWidth: `[calc(1em * ${1.5} * var(--leading-factor, 1) + var(--spacing-2) * 2 + 2px)]`,
        },
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
          borderColor: "[transparent]",
        },
      },
      link: {
        button: {
          display: "inline",
          padding: "0 !important",
          border: "0 !important",
          background: "[none !important]",
          fontWeight: "semibold",
          "&:not([aria-disabled=true]):hover": {
            textDecoration: "underline",
          },
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
      true: {},
    },
    hasIconRight: {
      true: {},
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
    {
      size: "xs",
      hasIconLeft: true,
      css: {
        iconText: { marginLeft: "1" },
      },
    },
    {
      size: "xs",
      hasIconRight: true,
      css: {
        iconText: { marginRight: "1" },
      },
    },
    {
      size: "sm",
      hasIconLeft: true,
      css: {
        iconText: { marginLeft: "1.5" },
      },
    },
    {
      size: "sm",
      hasIconRight: true,
      css: {
        iconText: { marginRight: "1.5" },
      },
    },
    {
      size: "md",
      hasIconLeft: true,
      css: {
        iconText: { marginLeft: "2" },
      },
    },
    {
      size: "md",
      hasIconRight: true,
      css: {
        iconText: { marginRight: "2" },
      },
    },
    {
      size: "lg",
      hasIconLeft: true,
      css: {
        iconText: { marginLeft: "2" },
      },
    },
    {
      size: "lg",
      hasIconRight: true,
      css: {
        iconText: { marginRight: "2" },
      },
    },
    // ── Icon-only (square) ──
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
    // ── Solid + Neutral ──
    {
      variant: "solid",
      tone: "neutral",
      css: {
        button: {
          background: "neutral.s120",
          borderColor: "neutral.s120",
          color: "fg.onSolid",
          "&:not([aria-disabled=true]):hover": {
            background: "neutral.s110",
            borderColor: "neutral.s110",
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
          background: "neutral.s115",
          borderColor: "neutral.s115",
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
          background: "neutral.s80",
          borderColor: "neutral.s80",
        },
      },
    },

    // ── Solid + Brand (blue) ──
    {
      variant: "solid",
      tone: "brand",
      css: {
        button: {
          background: "blue.s90",
          borderColor: "blue.s90",
          color: "fg.onSolid",
          "&:not([aria-disabled=true]):hover": {
            background: "blue.s85",
            borderColor: "blue.s85",
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
          background: "blue.s95",
          borderColor: "blue.s95",
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
          background: "blue.s60",
          borderColor: "blue.s60",
        },
      },
    },

    // ── Solid + Error (red) ──
    {
      variant: "solid",
      tone: "error",
      css: {
        button: {
          background: "red.s90",
          borderColor: "red.s90",
          color: "fg.onSolid",
          "&:not([aria-disabled=true]):hover": {
            background: "red.s85",
            borderColor: "red.s85",
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
          background: "red.s95",
          borderColor: "red.s95",
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
          background: "red.s60",
          borderColor: "red.s60",
        },
      },
    },
    // ── Subtle (neutral) ──
    {
      variant: "subtle",
      tone: "neutral",
      css: {
        button: {
          background: "white",
          borderColor: "neutral.s60",
          color: "neutral.s120",
          "&:not([aria-disabled=true]):hover": {
            background: "neutral.s20",
            borderColor: "neutral.s70",
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
          background: "neutral.s05",
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
          background: "neutral.s20",
          borderColor: "neutral.s50",
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
          background: "blue.s20",
          borderColor: "blue.s60",
          color: "blue.s90",
          "&:not([aria-disabled=true]):hover": {
            background: "blue.s30",
            borderColor: "blue.s70",
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
          background: "blue.s25",
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
          background: "blue.s20",
          borderColor: "blue.s40",
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
          background: "red.s20",
          borderColor: "red.s60",
          color: "red.s90",
          "&:not([aria-disabled=true]):hover": {
            background: "red.s25",
            borderColor: "red.s70",
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
          background: "red.s15",
          borderColor: "red.s30",
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
            borderColor: "neutral.a60",
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
          borderColor: "neutral.a50",
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
            borderColor: "blue.a70",
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
          borderColor: "blue.a50",
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
            borderColor: "red.a70",
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
          borderColor: "red.a60",
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
  ],
  defaultVariants: {
    variant: "solid",
    tone: "neutral",
    size: "md",
  },
});
