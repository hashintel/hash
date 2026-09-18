import { sva } from "@hashintel/ds-helpers/css";

export const styles = sva({
  slots: [
    "root",
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
      // Keyboard control without a visible input parks focus on the hidden
      // anchor, so the row itself has to show it.
      "&:has([data-ghost]:focus-visible)": {
        outline: "[2px solid var(--colors-black-a40)]",
        outlineOffset: "[2px]",
      },
    },
    item: {
      display: "inline-flex",
      alignItems: "center",
      flexShrink: "0",
      minWidth: "0",
    },
    // Wraps an item's content when keyboard control is on; the tags machine
    // marks it with `data-highlighted` while ArrowLeft/ArrowRight walk the
    // row. No highlight style of its own — the item styles itself off the
    // marker (as Chip does), so it keeps its native focus treatment.
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
    // fitted; it then flexes into whatever is left. The var levers let the
    // scroll variant switch it to content-driven sizing without a second
    // flex-basis rule (equal-specificity atomic rules resolve by extraction
    // order, which is fragile).
    input: {
      flexGrow: "1",
      flexShrink: "[var(--overflow-row-input-shrink, 1)]",
      flexBasis: "[var(--overflow-row-input-basis, 0%)]",
      minWidth: "[64px]",
      // Caps the draft's growth so items stay in view beside it, and leaves
      // an input-focusing click strip of row even when space abounds.
      maxWidth: "[min(80%, 300px)]",
      appearance: "none",
      border: "none",
      background: "[transparent]",
      outline: "none",
      padding: "0",
      font: "[inherit]",
      color: "[inherit]",
      _placeholder: { color: "neutral.s80" },
    },
    // The focus anchor keyboard control needs when no visible input was
    // asked for: tabbable, but out of layout and invisible.
    inputGhost: {
      position: "absolute",
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
        root: {
          overflowX: "auto",
          overflowY: "hidden",
          scrollbarWidth: "[none]",
          "&::-webkit-scrollbar": { display: "none" },
          // Room for the items' highlight ring, which the scroll clip would
          // otherwise cut: pad the clip box outward and pull it back with
          // negative margins so the layout footprint is unchanged. The scroll
          // padding keeps scroll-into-view from parking a ringed item flush
          // against the clipped edge.
          padding: "[2px]",
          margin: "[-2px]",
          scrollPaddingInline: "[4px]",
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
        // A scrolling row can make room, so the input tracks the draft as the
        // user types (up to its max width), nudging the items aside. Browsers
        // without field-sizing keep the flex-fill behaviour above.
        input: {
          "@supports (field-sizing: content)": {
            fieldSizing: "[content]",
            "--overflow-row-input-basis": "auto",
            "--overflow-row-input-shrink": "0",
          },
        },
      },
    },
    gapless: {
      true: {
        root: { gap: "0" },
        measure: { gap: "0" },
        // The separator supplies the spacing between cells but never precedes
        // the input, so restore the row gap there.
        input: { marginLeft: "1" },
      },
    },
    align: {
      left: {},
      right: {
        root: { justifyContent: "flex-end" },
      },
      center: {
        root: { justifyContent: "center" },
      },
    },
  },
  compoundVariants: [
    {
      align: "right",
      overflow: "scroll",
      css: {
        root: {
          // justify-end would push overflowing content past the inline-start
          // edge, where it cannot be scrolled to; an auto start margin on the
          // first cell right-aligns underflow yet yields once the row fills.
          justifyContent: "flex-start",
          "& > :first-child": { marginLeft: "auto" },
        },
      },
    },
    {
      align: "center",
      overflow: "scroll",
      css: {
        root: {
          // Same unreachable-overflow hazard as justify-end: zero-size edge
          // flex items with auto margins center underflow instead (pseudos,
          // so the absolutely positioned ghost input being the last child
          // doesn't matter), collapsing to 0 once the row fills.
          justifyContent: "flex-start",
          _before: { content: '""', marginLeft: "auto" },
          _after: { content: '""', marginRight: "auto" },
        },
      },
    },
  ],
});
