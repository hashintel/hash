import { cva } from "@hashintel/ds-helpers/css";

export const summaryRow = cva({
  base: {
    display: "flex",
    alignItems: "center",
  },
  // Text sits one step below the list's item text, matching its group labels
  variants: {
    size: {
      xxs: {
        fontSize: "[9px]",
        lineHeight: "[10px]",
        gap: "1",
      },
      xs: {
        textStyle: "xxs",
        gap: "1.5",
      },
      sm: {
        textStyle: "xs",
        gap: "2",
      },
      md: {
        textStyle: "sm",
        gap: "2.5",
      },
      lg: {
        textStyle: "sm",
        gap: "2.5",
      },
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export const summaryCount = cva({
  base: {
    color: "neutral.s90",
    whiteSpace: "nowrap",
  },
});

export const summaryAction = cva({
  base: {
    appearance: "none",
    border: "none",
    background: "[transparent]",
    padding: "0",
    // Right-aligned even when it is the only child of the row
    marginLeft: "[auto]",
    // Buttons don't inherit font from the UA stylesheet; the weight and
    // line-height longhands below still beat the shorthand
    font: "[inherit]",
    fontWeight: "[450]",
    color: "neutral.s100",
    cursor: "pointer",
    borderRadius: "sm",
    whiteSpace: "nowrap",
    lineHeight: "[1]",
    _hover: {
      color: "neutral.s110",
      textDecoration: "underline",
    },
    "&:focus:not(:focus-visible)": { outline: "none" },
    _focusVisible: {
      outline: "[1px solid var(--colors-neutral-s80)]",
      outlineOffset: "[3px]",
    },
  },
});
