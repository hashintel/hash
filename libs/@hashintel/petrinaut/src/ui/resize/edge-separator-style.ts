import { css, cva } from "@hashintel/ds-helpers/css";

const fineGrabSize = 8;
const coarseGrabSize = 24;

/**
 * How wide the strip along a separator is that a pointer can grab, in
 * pixels: for a mouse and for a finger. A group with an `EdgeSeparator` takes
 * this as its `resizeTargetMinimumSize`, so that the library takes a press
 * where the strip shows the cursor.
 */
export const grabSize = { fine: fineGrabSize, coarse: coarseGrabSize };

/**
 * For a separator whose `::before` is the strip a pointer grabs. While the
 * separator is dragged the strip covers the window, over the groups inside
 * the separator's own, so that the pointer keeps the separator's cursor
 * wherever it goes.
 */
export const dragStripStyle = css({
  "&[data-separator=active]::before": {
    position: "fixed",
    inset: "[0]",
    width: "auto",
    height: "auto",
    zIndex: "[2]",
  },
});

/**
 * For a pane right of a separator's line that is stacked over the separator,
 * as a pane with a group of its own is. The pane lies over the half of the
 * strip that is inside it, and shows the strip's cursor there with a strip of
 * its own: from its left border, which is inside its size, as far as the
 * separator's reaches.
 */
export const paneStripStyle = css({
  _before: {
    content: '""',
    position: "absolute",
    insetBlock: "[0]",
    left: "[-1px]",
    width: `[calc(${fineGrabSize}px / 2)]`,
    cursor: "ew-resize",
  },
  "@media (pointer: coarse)": {
    _before: { width: `[calc(${coarseGrabSize}px / 2)]` },
  },
});

/** A line down the group, with the strip a pointer grabs centred on it. */
const verticalLine = {
  width: "[0]",
  cursor: "ew-resize",
  "--line-direction": "to right",
  _before: {
    insetBlock: "[0]",
    left: "[calc(var(--grab-size) / -2)]",
    width: "[var(--grab-size)]",
  },
} as const;

/** A line across the group, with the strip a pointer grabs centred on it. */
const horizontalLine = {
  height: "[0]",
  cursor: "ns-resize",
  "--line-direction": "to bottom",
  _before: {
    insetInline: "[0]",
    top: "[calc(var(--grab-size) / -2)]",
    height: "[var(--grab-size)]",
  },
} as const;

/**
 * The separator is a line with no thickness on the panel's edge, so that
 * the stand-in beside it is as large as the panel. `::before` is the strip a
 * pointer grabs, which shows the resize cursor of the separator's axis, and
 * `::after` the strip that shows.
 *
 * The strip that shows is five pixels around the panel's border: two either
 * side of it. `edge` says where that border lies.
 */
export const edgeSeparatorStyle = cva({
  base: {
    position: "relative",
    pointerEvents: "auto",
    "--grab-size": `[${fineGrabSize}px]`,
    "@media (pointer: coarse)": {
      "--grab-size": `[${coarseGrabSize}px]`,
    },
    "&[aria-disabled]": { pointerEvents: "none" },
    _before: { content: '""', position: "absolute" },
    _after: {
      content: '""',
      position: "absolute",
      pointerEvents: "none",
      transition: "[background-color 0.3s ease]",
    },
    "&[data-separator=hover]::after": { backgroundColor: "neutral.a30" },
    "&[data-separator=active]::after": { backgroundColor: "blue.a40" },
    // Where the separator of a group crosses that of a group inside it, a
    // press takes both, and the library marks both. Each then shows the
    // cursor of the two axes.
    "[data-group]:has(> :is([data-separator=hover], [data-separator=active])):has([data-group] > :is([data-separator=hover], [data-separator=active])) :is([data-separator=hover], [data-separator=active])&":
      { cursor: "move" },
  },
  variants: {
    paintsBorder: {
      // The panel's border under the strip turns blue during a drag: its
      // pixel is painted over with the panel's background, the blue, and the
      // tint again.
      true: {
        "&[data-separator=active]::after": {
          backgroundImage:
            "[linear-gradient(var(--line-direction), transparent 2px, {colors.blue.a40} 2px 3px, transparent 3px), linear-gradient(var(--line-direction), transparent 2px, {colors.blue.a70} 2px 3px, transparent 3px), linear-gradient(var(--line-direction), transparent 2px, {colors.neutral.s00} 2px 3px, transparent 3px)]",
        },
      },
    },
    edge: {
      // A panel on the left of the group, whose border lies just outside its
      // size and so just right of the line. Also a pane right of the line
      // that has its border inside its size.
      left: {
        ...verticalLine,
        _after: { insetBlock: "[0]", left: "[-2px]", width: "[5px]" },
      },
      // A panel on the right of the group, whose border lies just left of the
      // line.
      right: {
        ...verticalLine,
        // Down to the bottom panel's edge and over it, so that the two
        // separators cross.
        marginBottom: "[calc(var(--grab-size) / -2)]",
        _after: {
          top: "[0]",
          bottom: "[calc(var(--grab-size) / 2)]",
          left: "[-3px]",
          width: "[5px]",
        },
      },
      // A pane under the line that has its border inside its size, so just
      // under the line, in a group that is in a panel of another.
      top: {
        ...horizontalLine,
        // Over the border and the edge of the panel the group is in, so that
        // this separator crosses the one on that edge.
        marginLeft: "[calc(var(--grab-size) / -2 - 1px)]",
        _after: {
          // From inside that border.
          left: "[calc(var(--grab-size) / 2 + 1px)]",
          right: "[0]",
          top: "[-2px]",
          height: "[5px]",
        },
      },
      // A panel at the bottom of the group, whose border lies just above the
      // line.
      bottom: {
        ...horizontalLine,
        // Over the left sidebar's edge, so that the two separators cross.
        marginLeft: "[calc(var(--grab-size) / -2)]",
        _after: {
          left: "[calc(var(--grab-size) / 2)]",
          right: "[0]",
          top: "[-3px]",
          height: "[5px]",
        },
      },
    },
  },
});
