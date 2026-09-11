import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: ["root", "item", "separator", "plus", "summary", "measure"],
  base: {
    root: {
      display: "flex",
      alignItems: "center",
      gap: "1",
      position: "relative",
      minWidth: "0",
      maxWidth: "full",
    },
    item: {
      display: "inline-flex",
      alignItems: "center",
      flexShrink: "0",
      minWidth: "0",
    },
    separator: {
      display: "inline-flex",
      alignItems: "center",
      flexShrink: "0",
      // Keep literal spaces in text separators, which flex would collapse.
      whiteSpace: "pre",
    },
    // The "+X" badge counting the items hidden by `truncate`.
    plus: {
      flexShrink: "0",
      whiteSpace: "nowrap",
      marginLeft: "[1px]",
      color: "neutral.s110",
    },
    summary: {
      minWidth: "0",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    // The hidden layer that renders every item at natural width so the
    // component can measure how much room the full row needs. Its gap must
    // match the root's. `max-content` opts out of absolute-position
    // shrink-to-fit, which would otherwise clamp the layer to the root and
    // shrink the cells being measured.
    measure: {
      display: "flex",
      alignItems: "center",
      gap: "1",
      position: "absolute",
      top: "0",
      left: "0",
      width: "[max-content]",
      visibility: "hidden",
      pointerEvents: "none",
      whiteSpace: "nowrap",
    },
  },
  variants: {
    overflow: {
      summary: {
        root: { width: "full", overflow: "hidden" },
      },
      truncate: {
        root: { width: "full", overflow: "hidden" },
      },
      scroll: {
        root: {
          overflowX: "auto",
          overflowY: "hidden",
          scrollbarWidth: "[none]",
          "&::-webkit-scrollbar": { display: "none" },
          // Clipped edges (flagged by the component from the scroll position)
          // fade out through a mask, letting the backdrop show through. When
          // both edges clip, the double-attribute selector wins on specificity.
          "&[data-clip-end]": {
            maskImage:
              "[linear-gradient(to right, #000 calc(100% - 16px), transparent)]",
          },
          "&[data-clip-start]": {
            maskImage: "[linear-gradient(to right, transparent, #000 16px)]",
          },
          "&[data-clip-start][data-clip-end]": {
            maskImage:
              "[linear-gradient(to right, transparent, #000 16px, #000 calc(100% - 16px), transparent)]",
          },
        },
      },
    },
    gapless: {
      true: {
        root: { gap: "0" },
        measure: { gap: "0" },
      },
    },
  },
});
