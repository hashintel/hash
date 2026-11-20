import { cva } from "@hashintel/ds-helpers/css";

import { arcStrokeColor } from "../../../styles/type-colors";

/**
 * The pin a port draws on a node's edge: a dot ringed in white so it sits on
 * the border, in the stroke colour of the arcs its token type draws. An
 * instance's pins are its React Flow handles and take this class; a port
 * place draws the same dot as decoration, so a port looks alike from inside
 * its component and outside.
 */
export const pinStyle = cva({
  base: {
    borderRadius: "full",
    borderStyle: "solid",
    borderColor: "[white]",
    boxSizing: "border-box",
    background: "[var(--port-pin-color)]",
    zIndex: "[3]",
  },
  variants: {
    size: {
      full: { width: "[11px]", height: "[11px]", borderWidth: "[2px]" },
      /** A folded card's pins shrink to wire ends: the links still show where they land. */
      wireEnd: { width: "[7px]", height: "[7px]", borderWidth: "[1px]" },
    },
    /** A pin kept as a place for a link to land, without being drawn. */
    hidden: {
      true: { opacity: "[0]", pointerEvents: "none" },
    },
  },
  defaultVariants: { size: "full" },
});

export const pinColorStyle = (
  typeColor: string | undefined,
): React.CSSProperties =>
  ({ "--port-pin-color": arcStrokeColor(typeColor) }) as React.CSSProperties;
