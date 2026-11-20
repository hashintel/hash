import { cva } from "@hashintel/ds-helpers/css";

/** How wide the strip along a panel's edge is that a pointer can grab, in pixels. */
export const GRAB_SIZE = 8;
/** The same for a finger. */
export const COARSE_GRAB_SIZE = 24;

/**
 * The separator is a line with no thickness on the panel's edge, so that
 * the stand-in beside it is as large as the panel. `::before` is the strip a
 * pointer grabs and `::after` the one that shows.
 */
export const edgeSeparatorStyle = cva({
  base: {
    position: "relative",
    pointerEvents: "auto",
    "--grab-size": `[${GRAB_SIZE}px]`,
    "@media (pointer: coarse)": {
      "--grab-size": `[${COARSE_GRAB_SIZE}px]`,
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
    "&[data-separator=focus]::after": { backgroundColor: "blue.a40" },
    "&[data-separator=active]::after": { backgroundColor: "blue.a40" },
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
      false: {},
    },
    edge: {
      // The strip that shows is five pixels around the panel's border, which
      // lies just outside the size the stand-in has: two inside the panel,
      // the border, and two outside.
      left: {
        width: "[0]",
        "--line-direction": "to right",
        _before: {
          insetBlock: "[0]",
          left: "[calc(var(--grab-size) / -2)]",
          width: "[var(--grab-size)]",
        },
        _after: { insetBlock: "[0]", left: "[-2px]", width: "[5px]" },
      },
      right: {
        width: "[0]",
        // Down to the bottom panel's edge and over it, so that the two
        // separators cross.
        marginBottom: "[calc(var(--grab-size) / -2)]",
        "--line-direction": "to right",
        _before: {
          insetBlock: "[0]",
          left: "[calc(var(--grab-size) / -2)]",
          width: "[var(--grab-size)]",
        },
        _after: {
          top: "[0]",
          bottom: "[calc(var(--grab-size) / 2)]",
          left: "[-3px]",
          width: "[5px]",
        },
      },
      // The top edge of a panel that is in the group itself, in a group that
      // is in a panel of another. The panel's border is inside its size, so
      // just under the line, as a border is just right of a `left` line.
      top: {
        height: "[0]",
        // Over the border and the edge of the panel the group is in, so that
        // this separator crosses the one on that edge.
        marginLeft: "[calc(var(--grab-size) / -2 - 1px)]",
        "--line-direction": "to bottom",
        _before: {
          insetInline: "[0]",
          top: "[calc(var(--grab-size) / -2)]",
          height: "[var(--grab-size)]",
        },
        _after: {
          // From inside that border.
          left: "[calc(var(--grab-size) / 2 + 1px)]",
          right: "[0]",
          top: "[-2px]",
          height: "[5px]",
        },
      },
      bottom: {
        height: "[0]",
        // Over the left sidebar's edge, so that the two separators cross.
        marginLeft: "[calc(var(--grab-size) / -2)]",
        "--line-direction": "to bottom",
        _before: {
          insetInline: "[0]",
          top: "[calc(var(--grab-size) / -2)]",
          height: "[var(--grab-size)]",
        },
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
