import { describe, expect, it } from "vitest";

import {
  getTransitionLogicAvailability,
  sanitizeSDCPNForExtensions,
  sanitizeTransitionForExtensions,
} from "./extensions";

import type { PetrinautExtensionSettings } from "./extensions";
import type { SDCPN } from "./types/sdcpn";

const allEnabled: PetrinautExtensionSettings = {
  colors: true,
  stochasticity: true,
  dynamics: true,
  parameters: true,
};

const createSDCPN = (
  transition: Partial<SDCPN["transitions"][number]> = {},
  place: Partial<SDCPN["places"][number]> = {},
): SDCPN => ({
  places: [
    {
      id: "place-1",
      name: "Input",
      colorId: place.colorId ?? "type-1",
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
      ...place,
    },
  ],
  transitions: [
    {
      id: "transition-1",
      name: "Fire",
      inputArcs: [{ placeId: "place-1", weight: 1, type: "standard" as const }],
      outputArcs: [],
      lambdaType: "predicate",
      lambdaCode: "export default Lambda(() => true);",
      transitionKernelCode: "export default TransitionKernel(() => ({}));",
      x: 0,
      y: 0,
      ...transition,
    },
  ],
  types: [
    {
      id: "type-1",
      name: "Token",
      iconSlug: "circle",
      displayColor: "#808080",
      elements: [{ elementId: "element-1", name: "x", type: "real" }],
    },
  ],
  differentialEquations: [],
  parameters: [],
});

describe("transition logic availability", () => {
  it("allows stochastic lambda authoring without coloured inputs", () => {
    const sdcpn = createSDCPN({}, { colorId: null });

    expect(
      getTransitionLogicAvailability(sdcpn.transitions[0]!, sdcpn, allEnabled),
    ).toMatchObject({
      lambda: true,
      predicateLambda: false,
      stochasticLambda: true,
    });
  });

  it("allows predicate lambda authoring for coloured standard inputs", () => {
    const sdcpn = createSDCPN();

    expect(
      getTransitionLogicAvailability(sdcpn.transitions[0]!, sdcpn, {
        ...allEnabled,
        stochasticity: false,
      }),
    ).toMatchObject({
      lambda: true,
      predicateLambda: true,
      stochasticLambda: false,
    });
  });

  it("ignores inhibitor arcs for predicate lambda authoring", () => {
    const sdcpn = createSDCPN({
      inputArcs: [
        { placeId: "place-1", weight: 1, type: "inhibitor" as const },
      ],
    });

    expect(
      getTransitionLogicAvailability(sdcpn.transitions[0]!, sdcpn, {
        ...allEnabled,
        stochasticity: false,
      }),
    ).toMatchObject({
      lambda: false,
      predicateLambda: false,
      stochasticLambda: false,
    });
  });

  it("clears unavailable lambda and kernel code while preserving core fields", () => {
    const sdcpn = createSDCPN(
      {
        lambdaType: "stochastic",
        outputArcs: [{ placeId: "place-1", weight: 1 }],
      },
      { colorId: null },
    );
    const transition = sanitizeTransitionForExtensions(
      sdcpn.transitions[0]!,
      sdcpn,
      {
        colors: false,
        stochasticity: false,
        dynamics: false,
        parameters: true,
      },
    );

    expect(transition).toMatchObject({
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
    });
  });

  it("returns a sanitized SDCPN copy without mutating the source", () => {
    const sdcpn = createSDCPN(
      {
        lambdaType: "stochastic",
        outputArcs: [{ placeId: "place-1", weight: 1 }],
      },
      { colorId: "type-1" },
    );

    const sanitized = sanitizeSDCPNForExtensions(sdcpn, {
      colors: false,
      stochasticity: false,
      dynamics: false,
      parameters: false,
    });

    expect(sanitized.places[0]!.colorId).toBeNull();
    expect(sanitized.transitions[0]).toMatchObject({
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
    });
    expect(sdcpn.places[0]!.colorId).toBe("type-1");
    expect(sdcpn.transitions[0]!.lambdaCode).not.toBe("");
  });
});
