import { describe, expect, it } from "vitest";

import { isSDCPNEqual } from "../lib/deep-equal";

import { normalizeSDCPN } from "./sdcpn-input";

import type { SDCPN } from "./sdcpn";

describe("normalizeSDCPN", () => {
  it("fills plain-net defaults for omitted place and transition fields", () => {
    const result = normalizeSDCPN({
      places: [{ id: "p1", name: "P1", x: 1, y: 2 }],
      transitions: [
        {
          id: "t1",
          name: "T1",
          inputArcs: [{ placeId: "p1" }],
          outputArcs: [{ placeId: "p1" }],
          x: 3,
          y: 4,
        },
      ],
    });

    expect(result.places[0]).toEqual({
      id: "p1",
      name: "P1",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 1,
      y: 2,
    });
    expect(result.transitions[0]).toEqual({
      id: "t1",
      name: "T1",
      inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "p1", weight: 1 }],
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 3,
      y: 4,
    });
    expect(result.types).toEqual([]);
    expect(result.parameters).toEqual([]);
    expect(result.differentialEquations).toEqual([]);
  });

  it("omits optional keys that are absent so structural equality is preserved", () => {
    const result = normalizeSDCPN({
      places: [{ id: "p1", name: "P1", x: 0, y: 0 }],
      transitions: [],
    });

    expect(Object.hasOwn(result.places[0]!, "visualizerCode")).toBe(false);
    expect(Object.hasOwn(result.places[0]!, "showAsInitialState")).toBe(false);
    expect(Object.hasOwn(result, "scenarios")).toBe(false);
    expect(Object.hasOwn(result, "metrics")).toBe(false);
  });

  it("preserves provided extension values instead of overwriting them", () => {
    const result = normalizeSDCPN({
      places: [
        {
          id: "p1",
          name: "P1",
          x: 0,
          y: 0,
          colorId: "c1",
          dynamicsEnabled: true,
          differentialEquationId: "d1",
          visualizerCode: "code",
          showAsInitialState: true,
        },
      ],
      transitions: [
        {
          id: "t1",
          name: "T1",
          inputArcs: [{ placeId: "p1", weight: 2, type: "inhibitor" }],
          outputArcs: [{ placeId: "p1", weight: 3 }],
          x: 0,
          y: 0,
          lambdaType: "stochastic",
          lambdaCode: "l",
          transitionKernelCode: "k",
        },
      ],
    });

    expect(result.places[0]).toMatchObject({
      colorId: "c1",
      dynamicsEnabled: true,
      differentialEquationId: "d1",
      visualizerCode: "code",
      showAsInitialState: true,
    });
    expect(result.transitions[0]).toMatchObject({
      inputArcs: [{ placeId: "p1", weight: 2, type: "inhibitor" }],
      outputArcs: [{ placeId: "p1", weight: 3 }],
      lambdaType: "stochastic",
      lambdaCode: "l",
      transitionKernelCode: "k",
    });
  });

  it("is idempotent on an already-complete SDCPN", () => {
    const complete: SDCPN = {
      places: [
        {
          id: "p1",
          name: "P1",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      ],
      transitions: [
        {
          id: "t1",
          name: "T1",
          inputArcs: [{ placeId: "p1", weight: 1, type: "standard" }],
          outputArcs: [{ placeId: "p1", weight: 1 }],
          lambdaType: "predicate",
          lambdaCode: "",
          transitionKernelCode: "",
          x: 0,
          y: 0,
        },
      ],
      types: [],
      parameters: [],
      differentialEquations: [],
    };

    expect(isSDCPNEqual(normalizeSDCPN(complete), complete)).toBe(true);
  });
});
