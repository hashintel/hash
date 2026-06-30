import { cva } from "@hashintel/ds-helpers/css";

export const styles = cva({
  base: {
    display: "flex",
  },
  variants: {
    layout: {
      block: {
        flexDirection: "column",
        alignItems: "flex-start",
        gap: "[12px]",
        width: "[fit-content]",

        "& > *": {
          width: "[100%]",
        },
      },
      inline: {
        flexWrap: "wrap",
        alignItems: "flex-start",
        columnGap: "[20px]",
        rowGap: "[10px]",
      },
      blockWithBorder: {
        flexDirection: "column",
        border: "[1px solid var(--colors-neutral-s45)]",
        borderRadius: "[8px]",

        "& > *": {
          padding: "[16px]",
          borderBottom: "[1px solid var(--colors-neutral-s45)]",
          width: "[100%]",
        },

        "& > *:last-child": {
          borderBottom: "none",
        },
      },
    },
  },
  defaultVariants: {
    layout: "block",
  },
});
