import { describe, expect, test } from "vitest";

import {
  createJsonDocHandle,
  createPetrinaut,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { applyPetrinautAiMutation } from "./apply-petrinaut-ai-mutation";

const definition: SDCPN = {
  places: [
    {
      id: "crew",
      name: "Crew",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
  transitions: [
    {
      id: "start",
      name: "Start",
      inputArcs: [],
      outputArcs: [],
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 100,
      y: 0,
    },
  ],
  types: [],
  parameters: [],
  differentialEquations: [],
};

describe("applyPetrinautAiMutation", () => {
  test("reports a duplicate canonical arc as a no-op", () => {
    const instance = createPetrinaut({
      document: createJsonDocHandle({
        id: "document",
        initial: definition,
        capabilities: { disabledExtensions: [] },
      }),
    });
    const call = {
      toolName: "addArc" as const,
      input: {
        transitionId: "start",
        arcDirection: "input" as const,
        placeId: "crew",
        weight: 1,
        type: "standard" as const,
      },
    };

    expect(applyPetrinautAiMutation({ aiToolCall: call, instance })).toEqual(
      expect.objectContaining({ applied: true }),
    );
    expect(applyPetrinautAiMutation({ aiToolCall: call, instance })).toEqual({
      applied: false,
      reason:
        "Added input arc was a no-op because the document already had that state.",
    });
    expect(instance.definition.get().transitions[0]?.inputArcs).toHaveLength(1);

    instance.dispose();
  });

  test("leaves the document unchanged when a canonical arc is rejected", () => {
    const instance = createPetrinaut({
      document: createJsonDocHandle({
        id: "document",
        initial: definition,
        capabilities: { disabledExtensions: [] },
      }),
    });

    expect(() =>
      applyPetrinautAiMutation({
        aiToolCall: {
          toolName: "addArc",
          input: {
            transitionId: "start",
            arcDirection: "input",
            placeId: "missing-place",
            weight: 1,
            type: "standard",
          },
        },
        instance,
      }),
    ).toThrow(/missing-place/u);
    expect(instance.definition.get().transitions[0]?.inputArcs).toEqual([]);

    instance.dispose();
  });
});
