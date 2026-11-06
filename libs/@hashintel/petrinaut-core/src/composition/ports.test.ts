import { describe, expect, it } from "vitest";

import {
  effectivePortDirection,
  inferPortDirection,
  portUsageMatchesDirection,
} from "./ports";

import type { Transition } from "../types/sdcpn";

const transition = (
  id: string,
  inputs: string[],
  outputs: string[],
): Transition => ({
  id,
  name: id,
  inputArcs: inputs.map((placeId) => ({
    placeId,
    weight: 1,
    type: "standard",
  })),
  outputArcs: outputs.map((placeId) => ({ placeId, weight: 1 })),
  lambdaType: "predicate",
  lambdaCode: "",
  transitionKernelCode: "",
  x: 0,
  y: 0,
});

describe("port directions", () => {
  const subnet = {
    transitions: [
      transition("work", ["in"], ["out"]),
      transition("loop", ["pool"], ["pool"]),
    ],
  };

  it("infers in, out and inout from the subnet's arcs", () => {
    expect(inferPortDirection(subnet, "in")).toBe("in");
    expect(inferPortDirection(subnet, "out")).toBe("out");
    expect(inferPortDirection(subnet, "pool")).toBe("inout");
    expect(inferPortDirection(subnet, "untouched")).toBe("inout");
  });

  it("prefers a declared direction", () => {
    expect(
      effectivePortDirection(subnet, { id: "in", portDirection: "inout" }),
    ).toBe("inout");
    expect(effectivePortDirection(subnet, { id: "in" })).toBe("in");
  });

  it("holds a declared direction against the arcs", () => {
    expect(
      portUsageMatchesDirection({ consumed: true, produced: true }, "in"),
    ).toBe(false);
    expect(
      portUsageMatchesDirection({ consumed: false, produced: true }, "out"),
    ).toBe(true);
    expect(
      portUsageMatchesDirection({ consumed: true, produced: true }, "inout"),
    ).toBe(true);
  });
});
