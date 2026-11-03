import { describe, expect, it, vi } from "vitest";

import type { SDCPN } from "../types/sdcpn";

const elkStarts = vi.hoisted(() => ({ count: 0 }));

vi.mock("elkjs", () => ({
  default: class {
    constructor() {
      elkStarts.count += 1;
    }

    layout = (graph: unknown) => Promise.resolve(graph);
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
      differentialEquationId: null,
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
});
