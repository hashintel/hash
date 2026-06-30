import { cva } from "@hashintel/ds-helpers/css";

export const styles = cva({
  base: {
    display: "flex",
  },
  variants: {
    layout: {
      // Vertical stack of options.
      block: {
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "[12px]",
      },
      // Options flow along a row, wrapping when they run out of space.
      inline: {
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        columnGap: "[20px]",
        rowGap: "[10px]",
      },
      // Vertical stack wrapped in a bordered, padded container.
      blockWithBorder: {
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "[14px]",
        border: "[1px solid var(--colors-neutral-a45)]",
        borderRadius: "[8px]",
        padding: "[16px]",
      },
    },
  },
  defaultVariants: {
    layout: "block",
  },
});
