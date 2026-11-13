import { describe, expect, it, vi } from "vitest";

import type { SDCPN } from "../types/sdcpn";

const elkStarts = vi.hoisted(() => ({
  count: 0,
  edges: [] as { id: string; sources: string[]; targets: string[] }[],
}));

vi.mock("elkjs", () => ({
  default: class {
    constructor() {
      elkStarts.count += 1;
    }

    layout = (graph: { edges?: typeof elkStarts.edges }) => {
      elkStarts.edges = graph.edges ?? [];
      return Promise.resolve(graph);
    };
  },
}));

/* A net with one node, as an empty net is laid out without ELK. */
const net: SDCPN = {
  places: [
    {
      id: "place",
      name: "Place",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    },
  ],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

describe("calculateGraphLayout", () => {
  it("starts ELK when it first lays a net out, not when the package is imported", async () => {
    const { calculateGraphLayout, layoutNodeDimensions } =
      await import("../index");

    expect(elkStarts.count).toBe(0);

    await calculateGraphLayout(net, layoutNodeDimensions);
    await calculateGraphLayout(net, layoutNodeDimensions);

    expect(elkStarts.count).toBe(1);
  });

  it("gives a fusion one edge per pair of nodes, and none from a node to itself", async () => {
    const { calculateGraphLayout, layoutNodeDimensions } =
      await import("../index");
    const port = (portPlaceId: string) => ({
      kind: "componentPort" as const,
      componentInstanceId: "m1",
      portPlaceId,
    });

    await calculateGraphLayout(
      {
        ...net,
        componentInstances: [
          {
            id: "m1",
            name: "M1",
            subnetId: "stage",
            parameterValues: {},
            x: 0,
            y: 0,
          },
        ],
        fusions: [
          {
            id: "loop",
            members: [
              { kind: "place", placeId: "place" },
              port("in"),
              port("out"),
            ],
          },
          { id: "self", members: [port("a"), port("b")] },
        ],
      },
      layoutNodeDimensions,
    );

    expect(elkStarts.edges).toEqual([
      { id: "fusion__loop-place-m1", sources: ["place"], targets: ["m1"] },
    ]);
  });
});
