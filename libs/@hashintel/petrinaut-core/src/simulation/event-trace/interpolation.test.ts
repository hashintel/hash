import { describe, expect, it } from "vitest";

import {
  createEngineFrame,
  createEngineFrameLayout,
  readEngineFrame,
  type EngineFrame,
} from "../frames/internal-frame";
import { hermite, interpolateFrame } from "./interpolation";

import type { SDCPN } from "../../types/sdcpn";
import type { TraceEvent } from "./trace";

/** One coloured place `moving` with a real attribute `x`, one plain place `still`. */
const sdcpn: SDCPN = {
  places: [
    {
      id: "moving",
      name: "Moving",
      colorId: "real",
      dynamicsEnabled: true,
      dynamics: [{ differentialEquationId: "de" }],
      x: 0,
      y: 0,
    },
    {
      id: "still",
      name: "Still",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    },
  ],
  transitions: [],
  types: [
    {
      id: "real",
      name: "Real",
      iconSlug: "circle",
      displayColor: "#000",
      elements: [{ elementId: "x", name: "x", type: "real" }],
    },
  ],
  differentialEquations: [],
  parameters: [],
};

const layout = createEngineFrameLayout(sdcpn);

const frameWith = (values: number[], stillCount = 1): EngineFrame =>
  createEngineFrame(layout, {
    places: {
      moving: { byteOffset: 0, count: values.length, strideBytes: 8 },
      still: {
        byteOffset: values.length * 8,
        count: stillCount,
        strideBytes: 0,
      },
    },
    transitions: {},
    buffer: new Uint8Array(new Float64Array(values).buffer),
  });

const eventAt = (
  time: number,
  values: number[],
  slopes: number[],
  options: { touched?: number[]; stillCount?: number } = {},
): TraceEvent => ({
  index: 0,
  time,
  kind: "reference",
  firedTransitionIds: [],
  touchedPlaceIndices: Uint32Array.from(options.touched ?? []),
  frame: frameWith(values, options.stillCount),
  derivatives: [Float64Array.from(slopes), null],
});

const readValues = (frame: EngineFrame): number[] => {
  const view = readEngineFrame(layout, frame);
  const count = view.placeCounts[0]!;
  return Array.from(view.tokenViews.f64.subarray(0, count));
};

describe("hermite", () => {
  it("reproduces a cubic from its endpoint values and slopes", () => {
    // y = t³ on [0, 2]: y(0) = 0, y'(0) = 0, y(2) = 8, y'(2) = 12.
    expect(hermite(0, 0, 8, 12, 2, 0.5)).toBeCloseTo(1, 12);
    expect(hermite(0, 0, 8, 12, 2, 0.75)).toBeCloseTo(1.5 ** 3, 12);
  });
});

describe("interpolateFrame", () => {
  it("returns the event's own frame at or before its time, and without dynamics", () => {
    const from = eventAt(1, [5], [2]);
    expect(interpolateFrame(layout, from, null, 1)).toBe(from.frame);
    expect(interpolateFrame(layout, from, null, 0.5)).toBe(from.frame);

    const noDynamics: TraceEvent = { ...from, derivatives: [null, null] };
    expect(interpolateFrame(layout, noDynamics, null, 2)).toBe(
      noDynamics.frame,
    );
  });

  it("follows the Hermite curve between two events holding the same tokens", () => {
    // Two tokens, each on its own cubic: x = t³ and x = 10 + t.
    const from = eventAt(0, [0, 10], [0, 1]);
    const to = eventAt(2, [8, 12], [12, 1]);

    expect(readValues(interpolateFrame(layout, from, to, 1))).toEqual([1, 11]);
    expect(readValues(interpolateFrame(layout, from, to, 2))).toEqual([8, 12]);
    expect(readValues(from.frame)).toEqual([0, 10]);
  });

  it("extrapolates along the derivative when the next event changes the place's tokens", () => {
    const from = eventAt(0, [1], [3]);
    const consumed = eventAt(2, [], [], { touched: [0] });
    const replaced = eventAt(2, [100], [0], { touched: [0] });
    const grown = eventAt(2, [1, 1], [0, 0]);

    expect(readValues(interpolateFrame(layout, from, consumed, 0.5))).toEqual([
      2.5,
    ]);
    expect(readValues(interpolateFrame(layout, from, replaced, 1))).toEqual([
      4,
    ]);
    expect(readValues(interpolateFrame(layout, from, grown, 1))).toEqual([4]);
    expect(readValues(interpolateFrame(layout, from, null, 1))).toEqual([4]);
  });

  it("leaves places without dynamics and the counts untouched", () => {
    const from = eventAt(0, [1], [1], { stillCount: 3 });
    const frame = interpolateFrame(layout, from, null, 1);
    const view = readEngineFrame(layout, frame);
    expect(Array.from(view.placeCounts)).toEqual([1, 3]);
  });
});
