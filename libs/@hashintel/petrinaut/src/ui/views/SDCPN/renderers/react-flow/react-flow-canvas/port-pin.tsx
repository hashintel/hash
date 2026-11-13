import { cva, cx } from "@hashintel/ds-helpers/css";

import { arcStrokeColor } from "../../../styles/type-colors";
import { pinSides, portOnSide } from "./pin-layout";

import type { PortDirection } from "@hashintel/petrinaut-core";

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

/** What a port place calls itself under its name. */
export const portPlaceLabels: Record<PortDirection, string> = {
  in: "Input port",
  out: "Output port",
  inout: "Port",
};

const decorativePinStyle = cva({
  base: {
    position: "absolute",
    top: "[50%]",
    pointerEvents: "none",
  },
  variants: {
    side: {
      left: { left: "[0]", transform: "[translate(-50%, -50%)]" },
      right: { right: "[0]", transform: "[translate(50%, -50%)]" },
    },
  },
});

/**
 * A port place's pins, centred on the edge the port's direction gives it:
 * the left edge for an input, the right for an output, both for a port that
 * works both ways.
 */
export const PortPins = ({
  direction,
  typeColor,
}: {
  direction: PortDirection;
  typeColor: string | undefined;
}) =>
  pinSides
    .filter((side) => portOnSide(direction, side))
    .map((side) => (
      <span
        key={side}
        className={cx(pinStyle(), decorativePinStyle({ side }))}
        style={pinColorStyle(typeColor)}
      />
    ));
