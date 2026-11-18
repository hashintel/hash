import { describe, expect, it } from "vitest";

import {
  bicycleAssembly,
  cafeQueue,
  dronePatrol,
  sirModel,
  wheelTruing,
} from "../examples";
import { DEFAULT_PETRINAUT_EXTENSIONS } from "../extensions";
import { createSDCPN } from "../lsp/lib/helper/create-sdcpn";
import { classifyNet } from "./classify-net";

import type { Transition } from "../types/sdcpn";

/** A net whose one transition moves a typed token from In to Out. */
const netWith = (transition: Partial<Transition>) =>
  createSDCPN({
    types: [{ id: "type", elements: [{ name: "value", type: "real" }] }],
    places: [
      { id: "in", name: "In", colorId: "type" },
      { id: "out", name: "Out", colorId: "type" },
    ],
    transitions: [
      {
        inputArcs: [{ placeId: "in", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "out", weight: 1 }],
        transitionKernelCode: "return { Out: [{ value: input.In[0].value }] };",
        ...transition,
      },
    ],
  });

describe("classifyNet", () => {
  it.each([
    {
      example: bicycleAssembly,
      time: "untimed",
      coloring: "none",
      chance: "deterministic",
    },
    {
      example: wheelTruing,
      time: "untimed",
      coloring: "static",
      chance: "stochastic",
    },
    {
      example: sirModel,
      time: "timed",
      coloring: "none",
      chance: "stochastic",
    },
    {
      example: cafeQueue,
      time: "timed",
      coloring: "none",
      chance: "stochastic",
    },
    {
      example: dronePatrol,
      time: "timed",
      coloring: "dynamic",
      chance: "stochastic",
    },
  ])("classifies $example.title", ({ example, ...netClass }) => {
    expect(classifyNet(example.petriNetDefinition)).toEqual(netClass);
  });

  describe("chance", () => {
    it("is deterministic when no transition fires at a rate and no code draws", () => {
      expect(classifyNet(netWith({})).chance).toBe("deterministic");
    });

    it("is stochastic once a transition fires at a rate, whatever its code", () => {
      const rated = netWith({
        lambdaType: "stochastic",
        transitionKernelCode: "return {",
      });
      expect(classifyNet(rated).chance).toBe("stochastic");
      // With the extension off the rate does not count, and the code decides.
      expect(
        classifyNet(rated, {
          ...DEFAULT_PETRINAUT_EXTENSIONS,
          stochasticity: false,
        }).chance,
      ).toBeNull();
    });

    it("is stochastic once a kernel samples a distribution", () => {
      const sampling = netWith({
        transitionKernelCode:
          "return { Out: [{ value: Distribution.Uniform(0, 1) }] };",
      });
      expect(classifyNet(sampling).chance).toBe("stochastic");
    });

    it("is stochastic once a predicate calls Math.random", () => {
      const coinToss = netWith({ lambdaCode: "return Math.random() < 0.5;" });
      expect(classifyNet(coinToss).chance).toBe("stochastic");
    });

    it("is stochastic once a differential equation calls Math.random", () => {
      const jittered = createSDCPN({
        types: [{ id: "type", elements: [{ name: "value", type: "real" }] }],
        differentialEquations: [
          { colorId: "type", code: "return { value: Math.random() };" },
        ],
      });
      expect(classifyNet(jittered).chance).toBe("stochastic");
      expect(
        classifyNet(jittered, {
          ...DEFAULT_PETRINAUT_EXTENSIONS,
          dynamics: false,
        }).chance,
      ).toBe("deterministic");
    });

    it("is not known while code that may draw does not compile", () => {
      expect(
        classifyNet(netWith({ transitionKernelCode: "return {" })).chance,
      ).toBeNull();
    });

    it("counts the code of a subnet's transitions", () => {
      const { transitions, places, types } = netWith({
        transitionKernelCode:
          "return { Out: [{ value: Distribution.Uniform(0, 1) }] };",
      });
      const nested = {
        ...createSDCPN(),
        subnets: [
          {
            id: "subnet",
            name: "Subnet",
            places,
            transitions,
            types,
            differentialEquations: [],
            parameters: [],
          },
        ],
      };
      expect(classifyNet(nested).chance).toBe("stochastic");
      expect(
        classifyNet(nested, { ...DEFAULT_PETRINAUT_EXTENSIONS, subnets: false })
          .chance,
      ).toBe("deterministic");
    });
  });
});
