import { describe, expect, it } from "vitest";

import type { SDCPN } from "../core/types/sdcpn";
import { isSDCPNEqual } from "./deep-equal";

const emptyNet: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const sampleNet: SDCPN = {
  places: [
    {
      id: "p1",
      name: "Place 1",
      colorId: "c1",
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 100,
      y: 200,
    },
  ],
  transitions: [
    {
      id: "t1",
      name: "Transition 1",
      inputArcs: [{ placeId: "p1", weight: 1 }],
      outputArcs: [{ placeId: "p1", weight: 2 }],
      lambdaType: "predicate",
      lambdaCode: "return true;",
      transitionKernelCode: "return input;",
      x: 300,
      y: 200,
    },
  ],
  types: [
    {
      id: "c1",
      name: "Token",
      iconSlug: "circle",
      displayColor: "#FF0000",
      elements: [{ elementId: "e1", name: "value", type: "real" }],
    },
  ],
  differentialEquations: [],
  parameters: [
    {
      id: "param1",
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "1.0",
    },
  ],
};

describe("isSDCPNEqual", () => {
  it("returns true for two empty nets", () => {
    expect(isSDCPNEqual(emptyNet, { ...emptyNet })).toBe(true);
  });

  it("returns true for identical nets", () => {
    const copy = JSON.parse(JSON.stringify(sampleNet)) as SDCPN;
    expect(isSDCPNEqual(sampleNet, copy)).toBe(true);
  });

  it("returns true for same reference", () => {
    expect(isSDCPNEqual(sampleNet, sampleNet)).toBe(true);
  });

  it("returns false when a place differs", () => {
    const modified = JSON.parse(JSON.stringify(sampleNet)) as SDCPN;
    modified.places[0]!.name = "Renamed";
    expect(isSDCPNEqual(sampleNet, modified)).toBe(false);
  });

  it("returns false when a transition arc weight differs", () => {
    const modified = JSON.parse(JSON.stringify(sampleNet)) as SDCPN;
    modified.transitions[0]!.outputArcs[0]!.weight = 99;
    expect(isSDCPNEqual(sampleNet, modified)).toBe(false);
  });

  it("returns false when a parameter is added", () => {
    const modified = JSON.parse(JSON.stringify(sampleNet)) as SDCPN;
    modified.parameters.push({
      id: "param2",
      name: "Extra",
      variableName: "extra",
      type: "integer",
      defaultValue: "0",
    });
    expect(isSDCPNEqual(sampleNet, modified)).toBe(false);
  });

  it("returns false when a color element differs", () => {
    const modified = JSON.parse(JSON.stringify(sampleNet)) as SDCPN;
    modified.types[0]!.elements[0]!.type = "boolean";
    expect(isSDCPNEqual(sampleNet, modified)).toBe(false);
  });

  it("returns false when places array has different length", () => {
    const modified = JSON.parse(JSON.stringify(sampleNet)) as SDCPN;
    modified.places.push({
      id: "p2",
      name: "Place 2",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    });
    expect(isSDCPNEqual(sampleNet, modified)).toBe(false);
  });
});
