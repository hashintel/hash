import { describe, expect, it } from "vitest";

import {
  portInHandleId,
  portOutHandleId,
  toCanvasConnection,
} from "./port-handles";

describe("toCanvasConnection", () => {
  it("names the port at either end, whichever of its pins the connection uses", () => {
    expect(
      toCanvasConnection({
        source: "m1",
        sourceHandle: portInHandleId("a"),
        target: "m2",
        targetHandle: portOutHandleId("b"),
      }),
    ).toEqual({
      sourceId: "m1",
      sourcePortId: "a",
      targetId: "m2",
      targetPortId: "b",
    });
  });

  it("names no port at a place or a transition", () => {
    expect(
      toCanvasConnection({
        source: "place",
        sourceHandle: null,
        target: "m1",
        targetHandle: portInHandleId("a"),
      }),
    ).toEqual({
      sourceId: "place",
      sourcePortId: null,
      targetId: "m1",
      targetPortId: "a",
    });
  });
});
