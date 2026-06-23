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
  subnets: true,
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

const createComponentPortSDCPN = (
  transition: Partial<SDCPN["transitions"][number]> = {},
): SDCPN => ({
  places: [],
  transitions: [
    {
      id: "transition-1",
      name: "Fire",
      inputArcs: [
        {
          endpoint: {
            kind: "componentPort",
            componentInstanceId: "instance-1",
            portPlaceId: "port-in",
          },
          weight: 1,
          type: "standard",
        },
      ],
      outputArcs: [
        {
          endpoint: {
            kind: "componentPort",
            componentInstanceId: "instance-1",
            portPlaceId: "port-out",
          },
          weight: 1,
        },
      ],
      lambdaType: "predicate",
      lambdaCode: "export default Lambda(() => true);",
      transitionKernelCode: "export default TransitionKernel(() => ({}));",
      x: 0,
      y: 0,
      ...transition,
    },
  ],
  types: [],
  differentialEquations: [],
  parameters: [],
  componentInstances: [
    {
      id: "instance-1",
      name: "Instance 1",
      subnetId: "subnet-1",
      parameterValues: {},
      x: 0,
      y: 0,
    },
  ],
  subnets: [
    {
      id: "subnet-1",
      name: "Subnet 1",
      places: [
        {
          id: "port-in",
          name: "Port In",
          colorId: "type-1",
          dynamicsEnabled: false,
          differentialEquationId: null,
          isPort: true,
          x: 0,
          y: 0,
        },
        {
          id: "port-out",
          name: "Port Out",
          colorId: "type-1",
          dynamicsEnabled: false,
          differentialEquationId: null,
          isPort: true,
          x: 0,
          y: 0,
        },
      ],
      transitions: [],
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
      componentInstances: [],
    },
  ],
});

describe("transition logic availability", () => {
  it("allows predicate and stochastic lambda authoring without coloured inputs when stochasticity is enabled", () => {
    const sdcpn = createSDCPN({}, { colorId: null });

    expect(
      getTransitionLogicAvailability(sdcpn.transitions[0]!, sdcpn, allEnabled),
    ).toMatchObject({
      lambda: true,
      predicateLambda: true,
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

  it("allows predicate lambda authoring for coloured read inputs", () => {
    const sdcpn = createSDCPN({
      inputArcs: [{ placeId: "place-1", weight: 1, type: "read" as const }],
    });

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

  it("allows predicate lambda authoring for coloured component-port inputs", () => {
    const sdcpn = createComponentPortSDCPN({ outputArcs: [] });

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

  it("allows transition kernel authoring for coloured component-port outputs", () => {
    const sdcpn = createComponentPortSDCPN({ inputArcs: [] });

    expect(
      getTransitionLogicAvailability(sdcpn.transitions[0]!, sdcpn, {
        ...allEnabled,
        stochasticity: false,
      }),
    ).toMatchObject({
      transitionKernel: true,
    });
  });

  it("ignores component-port arcs when subnets are disabled", () => {
    const sdcpn = createComponentPortSDCPN();

    expect(
      getTransitionLogicAvailability(sdcpn.transitions[0]!, sdcpn, {
        ...allEnabled,
        stochasticity: false,
        subnets: false,
      }),
    ).toMatchObject({
      lambda: false,
      predicateLambda: false,
      stochasticLambda: false,
      transitionKernel: false,
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
        subnets: true,
      },
    );

    expect(transition).toMatchObject({
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
    });
  });

  it("coerces stochastic lambda type when stochasticity is disabled", () => {
    const sdcpn = createSDCPN({
      lambdaType: "stochastic",
      lambdaCode: "export default Lambda(() => 1);",
    });

    const transition = sanitizeTransitionForExtensions(
      sdcpn.transitions[0]!,
      sdcpn,
      {
        ...allEnabled,
        stochasticity: false,
      },
    );

    expect(transition).toMatchObject({
      lambdaType: "predicate",
      lambdaCode: "",
    });
  });

  it("preserves lambda and kernel code for coloured component-port arcs", () => {
    const sdcpn = createComponentPortSDCPN();
    const transition = sanitizeTransitionForExtensions(
      sdcpn.transitions[0]!,
      sdcpn,
      {
        ...allEnabled,
        stochasticity: false,
      },
    );

    expect(transition).toMatchObject({
      lambdaCode: "export default Lambda(() => true);",
      transitionKernelCode: "export default TransitionKernel(() => ({}));",
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
      subnets: true,
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

  it("removes component-port arcs and code when subnets are disabled", () => {
    const sdcpn = createComponentPortSDCPN();

    const sanitized = sanitizeSDCPNForExtensions(sdcpn, {
      ...allEnabled,
      stochasticity: false,
      subnets: false,
    });

    expect(sanitized.subnets).toBeUndefined();
    expect(sanitized.componentInstances).toBeUndefined();
    expect(sanitized.transitions[0]).toMatchObject({
      inputArcs: [],
      outputArcs: [],
      lambdaCode: "",
      transitionKernelCode: "",
    });
    expect(sdcpn.transitions[0]!.inputArcs).toHaveLength(1);
    expect(sdcpn.transitions[0]!.outputArcs).toHaveLength(1);
  });

  it("converts coloured scenario initial-state rows to uncoloured counts when colours are disabled", () => {
    const sdcpn = {
      ...createSDCPN({}, { colorId: "type-1" }),
      scenarios: [
        {
          id: "scenario-1",
          name: "Scenario 1",
          scenarioParameters: [],
          parameterOverrides: {},
          initialState: {
            type: "per_place" as const,
            content: {
              "place-1": [[1], [2]],
            },
          },
        },
      ],
    };

    const sanitized = sanitizeSDCPNForExtensions(sdcpn, {
      ...allEnabled,
      colors: false,
      dynamics: false,
    });

    expect(sanitized.scenarios?.[0]?.initialState).toEqual({
      type: "per_place",
      content: { "place-1": "2" },
    });
    expect(sdcpn.scenarios[0]!.initialState).toEqual({
      type: "per_place",
      content: {
        "place-1": [[1], [2]],
      },
    });
  });
});
