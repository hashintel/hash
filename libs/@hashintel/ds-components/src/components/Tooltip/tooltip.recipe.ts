import { cva } from "@hashintel/ds-helpers/css";

export const contentStyles = cva({
  base: {
    borderRadius: "md",
    paddingX: "2",
    paddingY: "1",
    textStyle: "xs",
    maxWidth: "[300px]",
    wordWrap: "break-word",
  },
  variants: {
    variant: {
      dark: {
        backgroundColor: "neutral.s120/94",
        color: "white",
      },
      light: {
        backgroundColor: "white",
        color: "fg.body",
        boxShadow: "[0 2px 8px rgba(0, 0, 0, 0.15)]",
      },
    },
  },
  defaultVariants: {
    variant: "dark",
  },
});
