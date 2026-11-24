import { describe, expect, it } from "vitest";

import {
  effectivePortDirection,
  effectivePortDirections,
  inferPortDirection,
  portUsageMatchesDirection,
} from "./ports";

import type { Place, Transition } from "../types/sdcpn";

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
  const component = {
    transitions: [
      transition("work", ["in"], ["out"]),
      transition("loop", ["pool"], ["pool"]),
    ],
  };

  it("infers in, out and inout from the component's arcs", () => {
    expect(inferPortDirection(component, "in")).toBe("in");
    expect(inferPortDirection(component, "out")).toBe("out");
    expect(inferPortDirection(component, "pool")).toBe("inout");
    expect(inferPortDirection(component, "untouched")).toBe("inout");
  });

  it("prefers a declared direction", () => {
    expect(
      effectivePortDirection(component, { id: "in", portDirection: "inout" }),
    ).toBe("inout");
    expect(effectivePortDirection(component, { id: "in" })).toBe("in");
  });

  it("answers every port of a net at once, declared or inferred, and no other place", () => {
    const place = (id: string, overrides: Partial<Place> = {}): Place => ({
      id,
      name: id,
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
      ...overrides,
    });
    const places = [
      place("in", { isPort: true }),
      place("out", { isPort: true }),
      place("pool", { isPort: true, portDirection: "out" }),
      place("untouched", { isPort: true }),
      place("inside"),
    ];

    expect([...effectivePortDirections({ ...component, places })]).toEqual([
      ["in", "in"],
      ["out", "out"],
      ["pool", "out"],
      ["untouched", "inout"],
    ]);
    for (const port of places.filter(({ isPort }) => isPort)) {
      expect(
        effectivePortDirections({ ...component, places }).get(port.id),
      ).toBe(effectivePortDirection(component, port));
    }
  });

  it("reads no arc of a net whose ports all declare their direction", () => {
    const unreadable = {
      places: [
        {
          id: "in",
          name: "in",
          colorId: null,
          dynamicsEnabled: false,
          x: 0,
          y: 0,
          isPort: true,
          portDirection: "in" as const,
        },
      ],
      get transitions(): Transition[] {
        throw new Error("The arcs were read.");
      },
    };

    expect([...effectivePortDirections(unreadable)]).toEqual([["in", "in"]]);
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
