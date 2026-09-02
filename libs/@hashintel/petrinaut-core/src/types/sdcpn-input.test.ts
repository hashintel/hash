import { describe, expect, it } from "vitest";

import { isSDCPNEqual } from "../lib/deep-equal";
import { normalizeSDCPN } from "./sdcpn-input";

import type { SDCPN } from "./sdcpn";
import type { SDCPNInput } from "./sdcpn-input";

// Compile-time invariant: every complete SDCPN is a valid SDCPNInput, so
// existing createJsonDocHandle callers that pass a full document keep working.
const _sdcpnIsAssignableToInput: (doc: SDCPN) => SDCPNInput = (doc) => doc;

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
    expect(Object.hasOwn(result, "identities")).toBe(false);
    expect(Object.hasOwn(result, "statusViews")).toBe(false);
  });

  it("passes through identities and status views", () => {
    const result = normalizeSDCPN({
      places: [{ id: "p1", name: "P1", x: 0, y: 0 }],
      transitions: [],
      identities: [
        { id: "identity1", name: "Ticket", keyElementTypes: ["uuid"] },
      ],
      statusViews: [
        {
          id: "view1",
          name: "Ticket status",
          identityRef: "identity1",
          labels: [
            {
              id: "label1",
              name: "Todo",
              displayColor: "#94a3b8",
              places: ["p1"],
            },
          ],
        },
      ],
    });

    expect(result.identities).toEqual([
      { id: "identity1", name: "Ticket", keyElementTypes: ["uuid"] },
    ]);
    expect(result.statusViews).toHaveLength(1);
    expect(result.statusViews![0]!.labels[0]!.places).toEqual(["p1"]);
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

  it("preserves explicit arc endpoints and passes through subnet fields", () => {
    const result = normalizeSDCPN({
      places: [{ id: "p1", name: "P1", x: 0, y: 0, isPort: true }],
      transitions: [
        {
          id: "t1",
          name: "T1",
          inputArcs: [
            {
              endpoint: {
                kind: "componentPort",
                componentInstanceId: "ci1",
                portPlaceId: "p9",
              },
            },
          ],
          outputArcs: [{ endpoint: { kind: "place", placeId: "p1" } }],
          x: 0,
          y: 0,
        },
      ],
      subnets: [
        {
          id: "s1",
          name: "S1",
          places: [],
          transitions: [],
          types: [],
          differentialEquations: [],
          parameters: [],
        },
      ],
      componentInstances: [
        {
          id: "ci1",
          name: "CI1",
          subnetId: "s1",
          parameterValues: {},
          x: 0,
          y: 0,
        },
      ],
    });

    expect(result.places[0]!.isPort).toBe(true);
    expect(result.transitions[0]!.inputArcs[0]).toEqual({
      endpoint: {
        kind: "componentPort",
        componentInstanceId: "ci1",
        portPlaceId: "p9",
      },
      weight: 1,
      type: "standard",
    });
    expect(result.transitions[0]!.outputArcs[0]).toEqual({
      endpoint: { kind: "place", placeId: "p1" },
      weight: 1,
    });
    expect(result.subnets).toHaveLength(1);
    expect(result.componentInstances).toHaveLength(1);
  });

  it("omits subnet fields and arc endpoints that are absent", () => {
    const result = normalizeSDCPN({
      places: [],
      transitions: [
        {
          id: "t1",
          name: "T1",
          inputArcs: [{ placeId: "p1" }],
          outputArcs: [],
          x: 0,
          y: 0,
        },
      ],
    });

    expect(Object.hasOwn(result, "subnets")).toBe(false);
    expect(Object.hasOwn(result, "componentInstances")).toBe(false);
    expect(Object.hasOwn(result.places, "isPort")).toBe(false);
    expect(
      Object.hasOwn(result.transitions[0]!.inputArcs[0]!, "endpoint"),
    ).toBe(false);
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
