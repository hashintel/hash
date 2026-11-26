import { describe, expect, it } from "vitest";

import { layoutSignature } from "./net-graph-animation";

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
