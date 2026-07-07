import { describe, expect, it } from "vitest";

import { compileSimulationFrameReader } from "./frame-reader";
import {
  createEngineFrame,
  createEngineFrameLayout,
  type EngineFrame,
} from "./internal-frame";

import type { Color, Place, SDCPN, Transition } from "../../types/sdcpn";

const color: Color = {
  id: "color-1",
  name: "Position",
  iconSlug: "circle",
  displayColor: "#000000",
  elements: [
    { elementId: "x", name: "x", type: "real" },
    { elementId: "y", name: "y", type: "real" },
  ],
};

const place: Place = {
  id: "place-1",
  name: "Place 1",
  colorId: color.id,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
};

const transition: Transition = {
  id: "transition-1",
  name: "Transition 1",
  inputArcs: [],
  outputArcs: [],
  lambdaType: "stochastic",
  lambdaCode: "return 0;",
  transitionKernelCode: "return {};",
  x: 0,
  y: 0,
};

const sdcpn: Pick<SDCPN, "places" | "transitions" | "types"> = {
  places: [place],
  transitions: [transition],
  types: [color],
};

function makeFrame(): EngineFrame {
  // Two 16-byte tokens ({x, y} as two f64 fields) preceded by 16 junk bytes.
  const buffer = new Uint8Array(new Float64Array([99, 99, 1, 2, 3, 4]).buffer);

  return createEngineFrame(createEngineFrameLayout(sdcpn), {
    places: {
      [place.id]: { byteOffset: 16, count: 2, strideBytes: 16 },
    },
    transitions: {
      "transition-1": {
        timeSinceLastFiringMs: 10,
        firedInThisFrame: true,
        firingCount: 3,
      },
    },
    buffer,
  });
}

describe("SimulationFrameReader", () => {
  it("reads place and transition state without exposing raw frame layout", () => {
    const reader = compileSimulationFrameReader(sdcpn)(makeFrame(), 7, 1.25);

    expect(reader.number).toBe(7);
    expect(reader.time).toBe(1.25);
    expect(reader.getPlaceTokenCount(place.id)).toBe(2);
    expect(reader.getPlaceTokenCount("missing")).toBe(0);

    expect(reader.getPlaceTokens(place)).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);

    const transitionState = reader.getTransitionState("transition-1");
    expect(transitionState).toEqual({
      timeSinceLastFiringMs: 10,
      firedInThisFrame: true,
      firingCount: 3,
    });
    expect(transitionState).not.toHaveProperty("instance");

    expect(reader.toFrameState()).toEqual({
      number: 7,
      places: {
        [place.id]: { tokenCount: 2 },
      },
    });
  });

  it("returns copied token records", () => {
    const reader = compileSimulationFrameReader(sdcpn)(makeFrame(), 7, 1.25);
    const tokens = reader.getPlaceTokens(place);

    expect(tokens).toHaveLength(2);
    tokens[0]!.x = 42;

    expect(reader.getPlaceTokens(place)).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
  });
});
