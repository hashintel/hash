/**
 * The surface every node on the canvas shares: the hover and selection
 * treatment, and the overlay that dims a node outside the selection.
 *
 * Each node style draws its own outline and shadow. A compact card outlines
 * itself with a border and a classic node with a ring, so they set different
 * properties, and two classes setting the same property would leave the
 * winner to Panda's own ordering.
 *
 * Panda resolves style objects file by file, so the shared declarations live
 * in this `cva` and reach the node modules as the class it returns — a plain
 * object spread across files would not be extracted.
 */

import { css, cva } from "@hashintel/ds-helpers/css";

/** How a node is drawn relative to the current selection. */
export type SelectionVariant =
  | "resource"
  | "reactflow"
  | "notSelectedConnection"
  | "none";

export const nodeSurfaceStyle = cva({
  base: {
    width: "full",
    height: "full",
    boxSizing: "border-box",
    position: "relative",
    cursor: "default",
    transition: "[all 0.2s ease]",
    outline: "[0px solid rgba(75, 126, 156, 0)]",
    _hover: {
      outline: "[4px solid rgba(75, 126, 156, 0.2)]",
    },
    _after: {
      content: '""',
      transition: "[all 0.1s ease]",
      position: "absolute",
      pointerEvents: "none",
      borderRadius: "[inherit]",
    },
  },
  variants: {
    selection: {
      resource: {
        outline: "[4px solid rgba(59, 178, 246, 0.6)]",
        _hover: {
          outline: "[4px solid rgba(59, 178, 246, 0.7)]",
        },
      },
      reactflow: {
        outline: "[4px solid rgba(40, 172, 233, 0.6)]",
      },
      notSelectedConnection: {
        _after: {
          background: "[rgba(255, 255, 255, 0.5)]",
        },
      },
      none: {},
    },
  },
  defaultVariants: {
    selection: "none",
  },
});

/**
 * A transition's colours. Places take theirs from their token type; a
 * transition carries none, so its surface names them here.
 */
export const transitionSurfaceStyle = css({
  background: "neutral.s00",
  // The compact card outlines itself with a border, the classic node with a
  // ring; each mode reads the one that applies to it.
  borderColor: "neutral.s70",
  "--node-outline-color": "var(--colors-neutral-s70)",
  _hover: {
    borderColor: "neutral.s100",
    "--node-outline-color": "var(--colors-neutral-s100)",
  },
});
