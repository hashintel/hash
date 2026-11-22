import { cva, cx } from "@hashintel/ds-helpers/css";

import { pinSides, portOnSide } from "./pin-layout";
import { pinColorStyle, pinStyle } from "./port-pin-style";

import type { PortDirection } from "@hashintel/petrinaut-core";

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
        className={cx(
          "node-cover",
          "node-border",
          pinStyle(),
          decorativePinStyle({ side }),
        )}
        style={pinColorStyle(typeColor)}
      />
    ));
