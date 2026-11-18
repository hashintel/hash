import { expect, it } from "vitest";

import { receivesDrag } from "./node-handles";

it("offers a place to the moved end of a fusion link, whatever its other end is", () => {
  // The end that stays is a place: a new connection from a place never ends
  // on a place, and the moved end still has to reach one to be refused there.
  const dragFromPlace = { sourceKind: "place" };

  expect(
    receivesDrag({ ...dragFromPlace, rewiring: false, nodeKind: "place" }),
  ).toBe(false);
  expect(
    receivesDrag({ ...dragFromPlace, rewiring: true, nodeKind: "place" }),
  ).toBe(true);
  // A transition takes no end of a fusion link.
  expect(
    receivesDrag({ ...dragFromPlace, rewiring: true, nodeKind: "transition" }),
  ).toBe(false);
  expect(
    receivesDrag({ ...dragFromPlace, rewiring: false, nodeKind: "transition" }),
  ).toBe(true);
});
