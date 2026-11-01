import { cva } from "@hashintel/ds-helpers/css";

export const styles = cva({
  base: {
    display: "block",
    textStyle: "xxs",
    lineHeight: "none",
    fontWeight: "medium",
    textAlign: "right",
    whiteSpace: "nowrap",
    userSelect: "none",
    // keep the width stable as the digit count changes
    fontVariantNumeric: "tabular-nums",
    color: "neutral.s90",
  },
  variants: {
    /** Highlight the counter once the entered text exceeds the limit */
    overLimit: {
      true: { color: "red.s85" },
      false: {},
    },
    takesHeight: {
      true: {},
      false: { height: "0" },
    },
  },
  defaultVariants: {
    overLimit: false,
    takesHeight: false,
  },
});
