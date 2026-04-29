import { cva } from "@hashintel/ds-helpers/css";

export const styles = cva({
  base: {
    cursor: "pointer",
    display: "inline-block",
    borderRadius: "sm",
    border: "1px solid",
    "&:focus-visible": {
      outline: "2px solid neutral.s45",
    },
  },
  variants: {
    size: {
      xs: { paddingX: "1.5", paddingY: "0" },
      sm: { paddingX: "2", paddingY: "0.5" },
      md: { paddingX: "2.5", paddingY: "1.5" },
      lg: { paddingX: "3", paddingY: "2" },
    },
    shape: {
      default: { borderRadius: "md" },
      round: { borderRadius: "full" },
    },
    tone: {
      error: {},
      neutral: {},
      brand: {},
    },
    variant: {
      solid: {},
      subtle: {
        background: "white",
        borderColor: "neutral.a30",
        color: "fg.body",
        "&:hover": {
          background: "bgSolid.min.hover",
          borderColor: "bgSolid.solid.hover",
          color: "fg.body.hover",
        },
      },
      ghost: {
        background: "bg.min",
        borderColor: "bg.solid",
        color: "fg.body",
        "&:hover": {
          background: "bg.min.hover",
          borderColor: "bg.solid.hover",
          color: "fg.body.hover",
        },
      },
      link: {
        display: "inline",
        textAlign: "inherit",
        padding: "0",
        border: "0",
        color: "blue.fg.body",
        "&:hover": {
          textDecoration: "underline",
        },
      },
    },
    isLoading: {
      true: {},
    },
    isDisabled: {
      true: {},
    },
    isPressed: {
      true: {},
    },
  },
  compoundVariants: [
    {
      variant: "solid",
      tone: "neutral",
      css: {
        background: "neutral.s120",
        borderColor: "neutral.s120",
        color: "fg.onSolid",
        "&:hover": {
          background: "neutral.s110",
          borderColor: "neutral.s110",
        },
      },
    },
    {
      variant: "solid",
      tone: "neutral",
      isPressed: true,
      css: {
        background: "neutral.s125",
        borderColor: "neutral.s125",
      },
    },
    {
      variant: "solid",
      tone: "neutral",
      isDisabled: true,
      css: {
        background: "neutral.s40",
        borderColor: "neutral.s40",
      },
    },
    {
      variant: "solid",
      tone: "brand",
      css: {
        background: "blue.s120",
        borderColor: "blue.s120",
        color: "fg.onSolid",
        "&:hover": {
          background: "blue.s110",
          borderColor: "blue.s110",
        },
      },
    },
    {
      variant: "solid",
      tone: "brand",
      isPressed: true,
      css: {
        background: "blue.s125",
        borderColor: "blue.s125",
      },
    },
    {
      variant: "solid",
      tone: "brand",
      isDisabled: true,
      css: {
        background: "blue.s40",
        borderColor: "blue.s40",
      },
    },
    {
      variant: "solid",
      tone: "error",
      css: {
        background: "red.s120",
        borderColor: "red.s120",
        color: "fg.onSolid",
        "&:hover": {
          background: "red.s110",
          borderColor: "red.s110",
        },
      },
    },
    {
      variant: "solid",
      tone: "error",
      isPressed: true,
      css: {
        background: "red.s125",
        borderColor: "red.s125",
      },
    },
    {
      variant: "solid",
      tone: "error",
      isDisabled: true,
      css: {
        background: "red.s40",
        borderColor: "red.s40",
      },
    },
  ],
  defaultVariants: {
    variant: "solid",
    tone: "neutral",
    size: "md",
  },
});
