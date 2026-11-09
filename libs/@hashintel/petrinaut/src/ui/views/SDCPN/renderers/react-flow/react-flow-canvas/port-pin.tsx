import { css, cx } from "@hashintel/ds-helpers/css";

import { portPinColor } from "../../../styles/type-colors";

import type { PortDirection } from "@hashintel/petrinaut-core";

export const PIN_SIZE = 11;

/**
 * The pin a port draws on a node's edge: a dot in the port's token colour,
 * ringed in white so it sits on the border. An instance's pins are its React
 * Flow handles and take this class; a port place draws the same dot as
 * decoration, so a port looks alike from inside its component and outside.
 */
export const pinStyle = css({
  width: `[${PIN_SIZE}px]`,
  height: `[${PIN_SIZE}px]`,
  borderRadius: "full",
  border: "[2px solid white]",
  boxSizing: "border-box",
  background: "[var(--port-pin-color)]",
  zIndex: "[3]",
});

export const pinColorStyle = (
  typeColor: string | undefined,
): React.CSSProperties =>
  ({ "--port-pin-color": portPinColor(typeColor) }) as React.CSSProperties;

/** Whether a port of this direction draws a pin on this side of its node. */
export const portOnSide = (
  direction: PortDirection,
  side: "left" | "right",
): boolean =>
  direction === "inout" ||
  (side === "left" ? direction === "in" : direction === "out");

const portPlaceLabels: Record<PortDirection, string> = {
  in: "Input port",
  out: "Output port",
  inout: "Port",
};

/** What a port place calls itself under its name. */
export const portPlaceLabel = (direction: PortDirection): string =>
  portPlaceLabels[direction];

const decorativePinStyle = css({
  position: "absolute",
  top: "[50%]",
  pointerEvents: "none",
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
}) => (
  <>
    {portOnSide(direction, "left") ? (
      <span
        className={cx(pinStyle, decorativePinStyle)}
        style={{
          ...pinColorStyle(typeColor),
          left: 0,
          transform: "translate(-50%, -50%)",
        }}
      />
    ) : null}
    {portOnSide(direction, "right") ? (
      <span
        className={cx(pinStyle, decorativePinStyle)}
        style={{
          ...pinColorStyle(typeColor),
          right: 0,
          transform: "translate(50%, -50%)",
        }}
      />
    ) : null}
  </>
);
