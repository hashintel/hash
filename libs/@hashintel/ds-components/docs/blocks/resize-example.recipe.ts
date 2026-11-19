import { cva } from "@hashintel/ds-helpers/css";

export const resizeExampleRecipe = cva({
  base: {
    // Dashed border marks the frame as demo chrome, not part of the demo.
    border: "1px dashed {colors.bd.subtle}",
    borderRadius: "[6px]",
    padding: "[8px]",
    overflow: "hidden",
    minWidth: "[24px]",
    maxWidth: "[100%]",
  },
  variants: {
    resize: {
      horizontal: { resize: "horizontal" },
      vertical: { resize: "vertical" },
      both: { resize: "both" },
    },
  },
  defaultVariants: { resize: "horizontal" },
});
