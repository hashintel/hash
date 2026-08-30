import { describe, expect, it } from "vitest";

import {
  easeOutCubic,
  interpolate,
  layoutSignature,
} from "./net-graph-animation";

import type { NetGraphLayout } from "./net-graph-layout";

const layout = (
  nodes: { id: string; x: number; y: number }[],
): NetGraphLayout => ({
  width: 100,
  height: 100,
  nodes: nodes.map((node) => ({
    ...node,
    name: node.id,
    kind: "place",
    layer: 0,
  })),
  edges: [],
});

describe("easeOutCubic", () => {
  it("pins both ends of the animation", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it("decelerates: more than half the distance is covered by halfway", () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});

describe("interpolate", () => {
  it("returns the endpoints exactly", () => {
    expect(interpolate(10, 50, 0)).toBe(10);
    expect(interpolate(10, 50, 1)).toBe(50);
  });

  it("moves proportionally in between", () => {
    expect(interpolate(0, 100, 0.25)).toBe(25);
  });

  it("handles a backwards move", () => {
    expect(interpolate(100, 0, 0.5)).toBe(50);
  });
});

describe("layoutSignature", () => {
  it("is stable when only positions are unchanged", () => {
    expect(layoutSignature(layout([{ id: "a", x: 1, y: 2 }]))).toBe(
      layoutSignature(layout([{ id: "a", x: 1, y: 2 }])),
    );
  });

  it("changes when a node moves", () => {
    expect(layoutSignature(layout([{ id: "a", x: 1, y: 2 }]))).not.toBe(
      layoutSignature(layout([{ id: "a", x: 1, y: 9 }])),
    );
  });

  it("changes when the node set changes", () => {
    expect(layoutSignature(layout([{ id: "a", x: 0, y: 0 }]))).not.toBe(
      layoutSignature(
        layout([
          { id: "a", x: 0, y: 0 },
          { id: "b", x: 0, y: 0 },
        ]),
      ),
    );
  });
});
