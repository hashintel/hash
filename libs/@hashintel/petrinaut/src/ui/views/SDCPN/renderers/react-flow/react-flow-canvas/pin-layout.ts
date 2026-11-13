import {
  componentInstanceFooterHeight,
  componentInstanceHeaderHeight,
  type PortDirection,
} from "@hashintel/petrinaut-core";

import type { CanvasPort } from "../../../canvas-scene";

export type PinSide = "left" | "right";

export const pinSides: readonly PinSide[] = ["left", "right"];

/** Whether a port of this direction draws a pin on this side of its node. */
export const portOnSide = (direction: PortDirection, side: PinSide): boolean =>
  direction === "inout" ||
  (side === "left" ? direction === "in" : direction === "out");

/** A port and how far down the card each of its two pins is centred. */
export type PinRow = { port: CanvasPort } & Record<PinSide, number>;

/**
 * Where a card of this height centres the pins of its ports, under the
 * header. Unfolded, every port has a row of its own and both its pins sit on
 * it. Folded, the pins of each side spread along that side alone, so the
 * lines that land there stay apart, and the hidden pin a port keeps on the
 * side it does not use sits level with the one it shows.
 */
export const pinLayout = (
  ports: readonly CanvasPort[],
  height: number,
  unfolded: boolean,
): PinRow[] => {
  const bodyHeight =
    height - componentInstanceHeaderHeight - componentInstanceFooterHeight;
  const spread = (count: number, index: number) =>
    componentInstanceHeaderHeight + (bodyHeight * (index + 0.5)) / count;

  if (unfolded) {
    return ports.map((port, index) => {
      const row = spread(ports.length, index);
      return { port, left: row, right: row };
    });
  }

  const pinnedOn = (side: PinSide): Map<string, number> => {
    const pinned = ports.filter((port) => portOnSide(port.direction, side));
    return new Map(
      pinned.map((port, index) => [port.id, spread(pinned.length, index)]),
    );
  };
  const left = pinnedOn("left");
  const right = pinnedOn("right");
  const middle = spread(1, 0);
  return ports.map((port) => {
    const shown = left.get(port.id) ?? right.get(port.id) ?? middle;
    return {
      port,
      left: left.get(port.id) ?? shown,
      right: right.get(port.id) ?? shown,
    };
  });
};
