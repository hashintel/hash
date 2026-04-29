import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["button", "loadingContainer", "loadingContent"],
  base: {
    button: {
      cursor: "pointer",
      display: "inline-block",
      border: "1px solid",
      "&:focus-visible": {
        outline: "2px solid",
        outlineColor: "black.a60",
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
  },
  variants: {
    size: {
      xs: {
        button: {
          paddingX: "1.5",
          paddingY: "0",
          borderRadius: "md",
        },
      },
      sm: {
        button: {
          paddingX: "2",
          paddingY: "0.5",
          borderRadius: "lg",
        },
      },
      md: {
        button: {
          paddingX: "2.5",
          paddingY: "1.5",
          borderRadius: "lg",
        },
      },
      lg: {
        button: {
          paddingX: "3",
          paddingY: "2.5",
          borderRadius: "lg",
          gap: "1.5",
        },
      },
    },
    shape: {
      default: {},
      round: { button: { borderRadius: "full" } },
    },
    tone: {
      error: {},
      neutral: {},
      brand: {},
    },
    variant: {
      solid: {},
      subtle: {
        button: {
          background: "[transparent]",
          borderColor: "neutral.a60",
          color: "neutral.s120",
          "&:hover": {
            background: "neutral.bg.subtle.hover",
            borderColor: "neutral.a70",
          },
        },
      },
      ghost: {
        button: {
          background: "neutral.bg.subtle",
          color: "neutral.s110",
          "&:hover": {
            background: "neutral.bg.subtle.hover",
            borderColor: "neutral.a70",
          },
        },
      },
      link: {},
    },
    isLoading: {
      true: { button: { position: "relative" } },
    },
    isDisabled: {
      true: {},
    },
    isPressed: {
      true: {},
    },
  },
  compoundVariants: [
    // ── Solid + Neutral ──
    {
      variant: "solid",
      tone: "neutral",
      css: {
        button: {
          background: "neutral.s120",
          borderColor: "neutral.s120",
          color: "fg.onSolid",
          "&:hover": {
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
          boxShadow: "[inset_0_2px_4px_rgba(0,0,0,0.05)]",
        },
      },
    },
    {
      variant: "solid",
      tone: "neutral",
      isDisabled: true,
      css: {
        button: {
          opacity: "0.3",
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
          "&:hover": {
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
          boxShadow: "[inset_0_2px_4px_rgba(0,0,0,0.05)]",
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
          borderColor: "red.bd.subtle",
          color: "fg.onSolid",
          "&:hover": {
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
          boxShadow: "[inset_0_2px_4px_rgba(0,0,0,0.05)]",
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
    // ── Outline (neutral) ──
    {
      variant: "subtle",
      isPressed: true,
      css: {
        button: {
          background: "neutral.bg.subtle.active",
          color: "neutral.s110",
          boxShadow: "[inset_0_2px_4px_rgba(0,0,0,0.05)]",
        },
      },
    },
    {
      variant: "subtle",
      isDisabled: true,
      css: {
        button: {
          background: "neutral.bg.subtle.disabled",
          color: "neutral.s110",
          opacity: "0.4",
        },
      },
    },
    // ── Ghost (neutral) ──
    {
      variant: "ghost",
      isPressed: true,
      css: {
        button: {
          background: "neutral.bg.subtle.active",
          borderColor: "neutral.a60",
          boxShadow: "[inset_0_2px_4px_rgba(0,0,0,0.05)]",
        },
      },
    },
    {
      variant: "ghost",
      isDisabled: true,
      css: {
        button: {
          background: "neutral.bg.subtle.disabled",
          opacity: "0.4",
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
          borderColor: "red.bd.subtle",
          color: "red.s90",
          "&:hover": {
            background: "red.s25",
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
          boxShadow: "[inset_0_2px_4px_rgba(0,0,0,0.05)]",
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
          borderColor: "red.a30",
          color: "red.s60",
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
