import { describe, expect, it } from "vitest";

import { arcBase } from "../scene.test-helpers";
import { arcLayerAnchor } from "./arc-layer-anchor";

const arcs = [
  { id: "a", sourceId: "place", targetId: "first", transitionId: "first" },
  { id: "b", sourceId: "second", targetId: "place", transitionId: "second" },
  { id: "c", sourceId: "place", targetId: "third", transitionId: "third" },
].map((ends) => ({ ...arcBase, ...ends }));

/** React Flow has measured these nodes and no other. */
const placed =
  (...nodeIds: string[]) =>
  (nodeId: string) =>
    nodeIds.includes(nodeId);

describe("the node the arc layer hangs on", () => {
  it("is none for a net without arcs", () => {
    expect(arcLayerAnchor([], "first", placed("first"))).toBeUndefined();
  });

  it("is the first arc's transition until React Flow has measured a node", () => {
    expect(arcLayerAnchor(arcs, undefined, placed())).toBe("first");
  });

  it("is the first transition of an arc that React Flow can place", () => {
    expect(arcLayerAnchor(arcs, undefined, placed("second", "third"))).toBe(
      "second",
    );
  });

  it("stays the node it was while React Flow can place it", () => {
    expect(
      arcLayerAnchor(arcs, "third", placed("first", "second", "third")),
    ).toBe("third");
  });

  it("stays a node that has no arc left", () => {
    expect(arcLayerAnchor(arcs, "place", placed("place", "first"))).toBe(
      "place",
    );
  });

  it("moves to a node React Flow can place when it cannot place the one it was", () => {
    expect(arcLayerAnchor(arcs, "first", placed("third"))).toBe("third");
  });

  it("stays the node it was while React Flow can place none", () => {
    expect(arcLayerAnchor(arcs, "second", placed())).toBe("second");
  });
});
