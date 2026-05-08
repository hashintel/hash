import { describe, expect, it } from "vitest";

import type { Color, Place, Transition } from "../../types/sdcpn";
import { createSimulationFrameReader } from "./frame-reader";
import type { SimulationFrame } from "./internal-frame";

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
  lambdaType: "predicate",
  lambdaCode: "",
  transitionKernelCode: "",
  x: 0,
  y: 0,
};

function makeFrame(): SimulationFrame {
  return {
    time: 0.25,
    places: {
      [place.id]: { offset: 2, count: 2, dimensions: 2 },
    },
    transitions: {
      [transition.id]: {
        timeSinceLastFiringMs: 10,
        firedInThisFrame: true,
        firingCount: 3,
        instance: transition,
      },
    },
    buffer: new Float64Array([99, 99, 1, 2, 3, 4]),
  };
}

describe("SimulationFrameReader", () => {
  it("reads place and transition state without exposing raw frame layout", () => {
    const reader = createSimulationFrameReader(makeFrame(), 7);

    expect(reader.number).toBe(7);
    expect(reader.time).toBe(0.25);
    expect(reader.getPlaceTokenCount(place.id)).toBe(2);
    expect(reader.getPlaceTokenCount("missing")).toBe(0);

    expect(reader.getPlaceTokenValues(place.id)).toEqual({
      values: new Float64Array([1, 2, 3, 4]),
      count: 2,
    });
    expect(reader.getPlaceTokens(place, color)).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);

    const transitionState = reader.getTransitionState(transition.id);
    expect(transitionState).toEqual({
      timeSinceLastFiringMs: 10,
      firedInThisFrame: true,
      firingCount: 3,
    });
    expect(transitionState).not.toHaveProperty("instance");

    expect(reader.toFrameState()).toEqual({
      number: 7,
      time: 0.25,
      places: {
        [place.id]: { tokenCount: 2 },
      },
      transitions: {
        [transition.id]: transitionState,
      },
    });
  });

  it("returns a copied token value buffer", () => {
    const reader = createSimulationFrameReader(makeFrame(), 7);
    const values = reader.getPlaceTokenValues(place.id);

    expect(values).not.toBeNull();
    values!.values[0] = 42;

    expect(reader.getPlaceTokenValues(place.id)?.values).toEqual(
      new Float64Array([1, 2, 3, 4]),
    );
  });
});
