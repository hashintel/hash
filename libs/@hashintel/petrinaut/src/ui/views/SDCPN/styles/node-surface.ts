/**
 * The surface every node on the canvas shares: a hairline border, a soft
 * shadow, and the hover and selection treatment. Each node style layers its
 * own size, shape and colours on top.
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
    border: "1px solid",
    boxSizing: "border-box",
    position: "relative",
    cursor: "default",
    transition: "[all 0.2s ease]",
    outline: "[0px solid rgba(75, 126, 156, 0)]",
    shadow: "[0px 2px 9px rgba(0, 0, 0, 0.04)]",
    _hover: {
      outline: "[4px solid rgba(75, 126, 156, 0.2)]",
      shadow: "[0px 4px 11px rgba(0, 0, 0, 0.1)]",
    },
    _after: {
      content: '""',
      transition: "[all 0.1s ease]",
      position: "absolute",
      pointerEvents: "none",
      borderRadius: "[inherit]",
      inset: "[-1px]", // covers the border, since the surface is border-box
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
  borderColor: "neutral.s70",
  background: "neutral.s00",
  _hover: {
    borderColor: "neutral.s100",
  },
});
