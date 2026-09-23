import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: [
    "root",
    "scroller",
    "item",
    "itemPreview",
    "separator",
    "plus",
    "summary",
    "measure",
    "input",
    "inputGhost",
  ],
  base: {
    root: {
      display: "flex",
      alignItems: "center",
      gap: "1",
      position: "relative",
      minWidth: "0",
      maxWidth: "full",
      // Headroom the scroll clip leaves around the items for their highlight
      // rings — zero unless keyboard control can highlight them (the
      // `ringRoom` variant), so non-interactive rows render untouched.
      "--overflow-row-ring-room": "[0px]",
      "&:has([data-ghost]:focus-visible)": {
        outline: "[2px solid var(--colors-black-a40)]",
        outlineOffset: "[2px]",
      },
    },
    // `scroll` mode's scroll container, nested inside the root (which turns
    // block-level for it). As a block child its width resolves against the
    // root, so the ring-room padding plus equal negative margins expand the
    // clip box outward while the margin box — and every layout the root
    // takes part in — keeps the content size. On the root itself (a flex
    // item whose maxWidth caps the border box) the same trick would eat the
    // padding out of the content instead.
    scroller: {
      display: "flex",
      alignItems: "center",
      gap: "1",
      overflowX: "auto",
      overflowY: "hidden",
      scrollbarWidth: "[none]",
      "&::-webkit-scrollbar": { display: "none" },
      padding: "[var(--overflow-row-ring-room)]",
      margin: "[calc(-1 * var(--overflow-row-ring-room))]",
      // Keeps scroll-into-view from parking a ringed item flush against the
      // clipped edge.
      scrollPaddingInline: "[calc(2 * var(--overflow-row-ring-room))]",
      // Clipped edges (flagged by the component from the scroll position)
      // fade out through a mask, letting the backdrop show through. The mask
      // paints over the border box, which overhangs the visible edges by the
      // ring room — the stops shift by it so the fade spans the visible
      // 16 px exactly. When both edges clip, the double-attribute selector
      // wins on specificity.
      "&[data-clip-end]": {
        maskImage:
          "[linear-gradient(to right, #000 calc(100% - 16px - var(--overflow-row-ring-room)), transparent calc(100% - var(--overflow-row-ring-room)))]",
      },
      "&[data-clip-start]": {
        maskImage:
          "[linear-gradient(to right, transparent var(--overflow-row-ring-room), #000 calc(16px + var(--overflow-row-ring-room)))]",
      },
      "&[data-clip-start][data-clip-end]": {
        maskImage:
          "[linear-gradient(to right, transparent var(--overflow-row-ring-room), #000 calc(16px + var(--overflow-row-ring-room)), #000 calc(100% - 16px - var(--overflow-row-ring-room)), transparent calc(100% - var(--overflow-row-ring-room)))]",
      },
    },
    item: {
      display: "inline-flex",
      alignItems: "center",
      flexShrink: "0",
      minWidth: "0",
    },
    itemPreview: {
      display: "inline-flex",
      alignItems: "center",
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
      display: "inline-flex",
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
    // The add-item input: only its min width is reserved while items are
    // fitted; it then flexes into whatever is left.
    input: {
      flexGrow: "1",
      flexShrink: "1",
      flexBasis: "[0%]",
      minWidth: "[64px]",
      maxWidth: "[min(80%, 300px)]",
      appearance: "none",
      border: "none",
      background: "[transparent]",
      outline: "none",
      padding: "0",
      font: "[inherit]",
      color: "[inherit]",
      marginLeft: "[3px]",
      "&:first-child": { marginLeft: "0" },
      "[data-part='item']:has([data-highlighted]) ~ &": {
        caretColor: "[transparent]",
      },
      _placeholder: { color: "neutral.s80" },
    },
    // The focus anchor keyboard control needs when no visible input was
    // asked for - Pinned to the viewport rather than positioned within the row to avoid browser scrolls
    inputGhost: {
      position: "fixed",
      top: "0",
      left: "0",
      width: "[1px]",
      height: "[1px]",
      padding: "0",
      border: "none",
      outline: "none",
      opacity: "0",
      pointerEvents: "none",
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
        // Block, so the nested scroller's width resolves by block rules (see
        // the scroller comment above).
        root: { display: "block" },
        input: {
          fieldSizing: "content",
          flexBasis: "[auto]",
          flexShrink: "0",
        },
      },
    },
    gapless: {
      true: {
        root: { gap: "0" },
        scroller: { gap: "0" },
        measure: { gap: "0" },
        input: { marginLeft: "[6px]" },
      },
    },
    // Keyboard control can ring the items — give the scroll clip headroom.
    ringRoom: {
      true: {
        root: { "--overflow-row-ring-room": "[2px]" },
      },
    },
    align: {
      left: {},
      right: {
        root: { justifyContent: "flex-end" },
        input: { flexGrow: "0" },
      },
      center: {
        root: { justifyContent: "center" },
        input: { flexGrow: "0" },
      },
    },
  },
  compoundVariants: [
    {
      align: "right",
      overflow: "scroll",
      css: {
        // justify-end would push overflowing content past the inline-start
        // edge, where it cannot be scrolled to; an auto start margin on the
        // first cell right-aligns underflow yet yields once the row fills.
        scroller: {
          "& > :first-child": { marginLeft: "auto" },
        },
        input: {
          "&:first-child": { marginLeft: "auto" },
        },
      },
    },
    {
      align: "center",
      overflow: "scroll",
      css: {
        scroller: {
          _before: { content: '""', marginLeft: "auto" },
          _after: { content: '""', marginRight: "auto" },
        },
      },
    },
  ],
});
