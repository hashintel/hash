import { describe, expect, test } from "vitest";

import {
  createJsonDocHandle,
  createPetrinaut,
  type Petrinaut,
  toPetrinautId,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { createTestPluginApi } from "../testing/create-test-plugin-api";
import { executePetrinautAiMutation } from "./apply-petrinaut-ai-mutation";

import type { EditRefusal } from "@hashintel/petrinaut/ui";

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

type MutationCall = Parameters<
  typeof executePetrinautAiMutation
>[0]["aiToolCall"];

/** Runs `aiToolCall` through the edits of a plugin `api` over `instance`. */
const run = (
  instance: Petrinaut,
  aiToolCall: MutationCall,
  refusal: EditRefusal | null = null,
) =>
  executePetrinautAiMutation({
    aiToolCall,
    getDefinition: () => instance.definition.get(),
    edit: createTestPluginApi(instance, { refusal: () => refusal }).document
      .edit,
  });

describe("executePetrinautAiMutation", () => {
  test("owns canonical mutation output shaping at the callback boundary", () => {
    const instance = createPetrinaut({
      document: createJsonDocHandle({ initial: definition }),
    });
    const aiToolCall = {
      toolName: "addPlace" as const,
      input: {
        id: "queue",
        name: "Queue",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 10,
        y: 20,
      },
    };

    expect(run(instance, aiToolCall)).toEqual({
      applied: true,
      title: "Added place Queue",
      target: {
        kind: "selection",
        item: { type: "place", id: toPetrinautId("queue") },
      },
    });
    const addArcCall = {
      toolName: "addArc" as const,
      input: {
        transitionId: "start",
        arcDirection: "input" as const,
        placeId: "crew",
        weight: 1,
        type: "standard" as const,
      },
    };
    run(instance, addArcCall);
    expect(run(instance, addArcCall)).toEqual({
      applied: false,
      reason: "Added input arc left the document unchanged.",
    });

    instance.dispose();
  });

  test("reports a refused edit without changing the document", () => {
    const instance = createPetrinaut({
      document: createJsonDocHandle({ initial: definition }),
    });

    expect(
      run(
        instance,
        {
          toolName: "addArc",
          input: {
            transitionId: "start",
            arcDirection: "input",
            placeId: "crew",
            weight: 1,
            type: "standard",
          },
        },
        { kind: "simulate-mode" },
      ),
    ).toMatchObject({ applied: false, blocked: "simulate-mode" });
    expect(instance.definition.get().transitions[0]?.inputArcs).toEqual([]);

    instance.dispose();
  });

  test("rejects unsupported names without indexing edits", () => {
    const instance = createPetrinaut({
      document: createJsonDocHandle({ initial: definition }),
    });
    const callbackReads: PropertyKey[] = [];
    const edit = new Proxy(createTestPluginApi(instance).document.edit, {
      get: (target, property, receiver) => {
        callbackReads.push(property);
        return Reflect.get(target, property, receiver);
      },
    });
    const aiToolCall = {
      toolName: "toString",
      input: {},
    } as unknown as MutationCall;

    expect(() =>
      executePetrinautAiMutation({
        aiToolCall,
        getDefinition: () => instance.definition.get(),
        edit,
      }),
    ).toThrow("Unsupported Petrinaut mutation: toString");
    expect(callbackReads).toEqual([]);

    instance.dispose();
  });

  test("does not intercept edit failures", () => {
    const instance = createPetrinaut({
      document: createJsonDocHandle({ initial: definition }),
    });
    const callbackError = new Error("Canonical callback failed");
    const edit = {
      ...createTestPluginApi(instance).document.edit,
      addPlace: () => {
        throw callbackError;
      },
    };

    expect(() =>
      executePetrinautAiMutation({
        aiToolCall: {
          toolName: "addPlace",
          input: {
            id: "queue",
            name: "Queue",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 10,
            y: 20,
          },
        },
        getDefinition: () => instance.definition.get(),
        edit,
      }),
    ).toThrow(callbackError);

    instance.dispose();
  });

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

    expect(run(instance, call)).toEqual(
      expect.objectContaining({ applied: true }),
    );
    expect(run(instance, call)).toEqual({
      applied: false,
      reason: "Added input arc left the document unchanged.",
    });
    expect(instance.definition.get().transitions[0]?.inputArcs).toHaveLength(1);

    instance.dispose();
  });

  test("does not claim a differently weighted arc already exists", () => {
    const instance = createPetrinaut({
      document: createJsonDocHandle({
        id: "document",
        initial: definition,
        capabilities: { disabledExtensions: [] },
      }),
    });
    const endpoint = {
      toolName: "addArc" as const,
      input: {
        transitionId: "start",
        arcDirection: "input" as const,
        placeId: "crew",
        type: "standard" as const,
      },
    };

    run(instance, { ...endpoint, input: { ...endpoint.input, weight: 1 } });
    const result = run(instance, {
      ...endpoint,
      input: { ...endpoint.input, weight: 2 },
    });

    // The core skips a second arc between the same endpoints whatever its
    // weight, so the document still carries weight 1, not the requested 2.
    expect(result).toEqual({
      applied: false,
      reason: "Added input arc left the document unchanged.",
    });
    expect(instance.definition.get().transitions[0]?.inputArcs).toEqual([
      expect.objectContaining({ placeId: toPetrinautId("crew"), weight: 1 }),
    ]);

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
      run(instance, {
        toolName: "addArc",
        input: {
          transitionId: "start",
          arcDirection: "input",
          placeId: "missing-place",
          weight: 1,
          type: "standard",
        },
      }),
    ).toThrow("`missing-place`");
    expect(instance.definition.get().transitions[0]?.inputArcs).toEqual([]);

    instance.dispose();
  });
});
