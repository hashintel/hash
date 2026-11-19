import { describe, expect, it, vi } from "vitest";

import type { SDCPN } from "../types/sdcpn";

const elkCalls = vi.hoisted(() => ({
  starts: 0,
  edges: [] as { id: string; sources: string[]; targets: string[] }[],
}));

vi.mock("elkjs", () => ({
  default: class {
    constructor() {
      elkCalls.starts += 1;
    }

    layout = (graph: { edges?: typeof elkCalls.edges }) => {
      elkCalls.edges = graph.edges ?? [];
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

    expect(elkCalls.starts).toBe(0);

    await calculateGraphLayout(net, layoutNodeDimensions);
    await calculateGraphLayout(net, layoutNodeDimensions);

    expect(elkCalls.starts).toBe(1);
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
            name: "Loop",
            members: [
              { kind: "place", placeId: "place" },
              port("in"),
              port("out"),
            ],
          },
          { id: "self", name: "Self", members: [port("a"), port("b")] },
        ],
      },
      layoutNodeDimensions,
    );

    expect(elkCalls.edges).toEqual([
      { id: "fusion__loop-place-m1", sources: ["place"], targets: ["m1"] },
    ]);
  });

  it("gives a fusion no edge to a member whose place or instance is gone", async () => {
    const { calculateGraphLayout, layoutNodeDimensions } =
      await import("../index");

    await calculateGraphLayout(
      {
        ...net,
        fusions: [
          {
            id: "dangling",
            name: "Dangling",
            members: [
              { kind: "place", placeId: "place" },
              {
                kind: "componentPort",
                componentInstanceId: "gone",
                portPlaceId: "in",
              },
            ],
          },
        ],
      },
      layoutNodeDimensions,
    );

    expect(elkCalls.edges).toEqual([]);
  });
});
