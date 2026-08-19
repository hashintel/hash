import { cva } from "@hashintel/ds-helpers/css";

export const contentStyles = cva({
  base: {
    borderRadius: "md",
    paddingX: "2",
    paddingY: "1",
    textStyle: "xs",
    maxWidth: "[300px]",
    wordWrap: "break-word",
    // Set by Ark's positioner to the side facing the trigger, so the
    // tooltip pops out of / recedes into the trigger.
    transformOrigin: "var(--transform-origin)",
    _open: {
      animationName: "tooltipIn",
      animationDuration: "fast",
      animationTimingFunction: "[ease-out]",
    },
    _closed: {
      animationName: "tooltipOut",
      animationDuration: "faster",
      animationTimingFunction: "[ease-in]",
    },
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
