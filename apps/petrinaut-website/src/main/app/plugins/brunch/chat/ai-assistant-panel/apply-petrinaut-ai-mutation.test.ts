import { describe, expect, test } from "vitest";

import {
  createJsonDocHandle,
  createPetrinaut,
  toPetrinautId,
  type Petrinaut,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { createTestEditorApi } from "../testing/create-test-editor-api";
import {
  applyPetrinautAiMutation,
  executePetrinautAiMutation,
} from "./apply-petrinaut-ai-mutation";

/** The plugin document over `instance`, whose edits are refusal-aware. */
const documentOf = (instance: Petrinaut) =>
  createTestEditorApi(instance).document;

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

    expect(
      executePetrinautAiMutation({
        aiToolCall,
        getDefinition: () => instance.definition.get(),
        edit: documentOf(instance).edit,
      }),
    ).toEqual({
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
    executePetrinautAiMutation({
      aiToolCall: addArcCall,
      getDefinition: () => instance.definition.get(),
      edit: documentOf(instance).edit,
    });
    expect(
      executePetrinautAiMutation({
        aiToolCall: addArcCall,
        getDefinition: () => instance.definition.get(),
        edit: documentOf(instance).edit,
      }),
    ).toEqual({
      applied: false,
      reason: "Added input arc left the document unchanged.",
    });

    instance.dispose();
  });

  test("rejects unsupported names without indexing callbacks", () => {
    const instance = createPetrinaut({
      document: createJsonDocHandle({ initial: definition }),
    });
    const callbackReads: PropertyKey[] = [];
    const edit = new Proxy(documentOf(instance).edit, {
      get: (target, property, receiver) => {
        callbackReads.push(property);
        return Reflect.get(target, property, receiver);
      },
    });
    const aiToolCall = {
      toolName: "toString",
      input: {},
    } as unknown as Parameters<
      typeof executePetrinautAiMutation
    >[0]["aiToolCall"];

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

  test("does not intercept callback failures", () => {
    const instance = createPetrinaut({
      document: createJsonDocHandle({ initial: definition }),
    });
    const callbackError = new Error("Canonical callback failed");
    const edit = {
      ...documentOf(instance).edit,
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

  test("reports a refused edit as not applied, with the refusal, and changes nothing", () => {
    const instance = createPetrinaut({
      document: createJsonDocHandle({ initial: definition }),
    });
    const { edit } = createTestEditorApi(instance, {
      refusal: () => ({ kind: "host-readonly" }),
    }).document;

    expect(
      executePetrinautAiMutation({
        aiToolCall: {
          toolName: "addArc",
          input: {
            transitionId: "start",
            arcDirection: "input",
            placeId: "crew",
            weight: 1,
            type: "standard",
          },
        },
        getDefinition: () => instance.definition.get(),
        edit,
      }),
    ).toEqual({
      applied: false,
      blocked: "host-readonly",
      reason: expect.any(String) as string,
    });
    expect(instance.definition.get().transitions[0]?.inputArcs).toEqual([]);

    instance.dispose();
  });
});

describe("applyPetrinautAiMutation", () => {
  test("observes the live definition around one synchronous execution with its call identity", () => {
    const handle = createJsonDocHandle({
      id: "a3-observation",
      initial: definition,
    });
    const instance = createPetrinaut({ document: handle });
    const observations: (SDCPN | undefined)[] = [];
    let retainedExecute: (() => unknown) | undefined;
    const output = applyPetrinautAiMutation({
      document: documentOf(instance),
      toolCallId: "a3-call",
      aiToolCall: {
        toolName: "addArc",
        input: {
          transitionId: "start",
          arcDirection: "input",
          placeId: "crew",
          weight: 1,
          type: "standard",
        },
      },
      executeMutation: ({ toolCallId, toolName, input, execute }) => {
        expect(toolCallId).toBe("a3-call");
        expect(toolName).toBe("addArc");
        expect(input).toMatchObject({ placeId: "crew" });
        retainedExecute = execute;
        observations.push(structuredClone(handle.doc()));
        const result = execute();
        observations.push(structuredClone(handle.doc()));
        expect(() => execute()).toThrow(/once/u);
        return result;
      },
    });
    expect(output).toMatchObject({ applied: true });
    expect(observations[0]?.transitions[0]?.inputArcs).toHaveLength(0);
    expect(observations[1]?.transitions[0]?.inputArcs).toHaveLength(1);
    expect(() => retainedExecute?.()).toThrow(/synchronous/u);
    instance.dispose();
  });

  test("allows synchronous refusal without applying and closes execution after hook failure", () => {
    const instance = createPetrinaut({
      document: createJsonDocHandle({ initial: definition }),
    });
    const aiToolCall = {
      toolName: "addArc" as const,
      input: {
        transitionId: "start",
        arcDirection: "input" as const,
        placeId: "crew",
        weight: 1,
        type: "standard" as const,
      },
    };
    expect(
      applyPetrinautAiMutation({
        document: documentOf(instance),
        aiToolCall,
        toolCallId: "a3-stale",
        executeMutation: () => ({ applied: false, reason: "Stale base" }),
      }),
    ).toEqual({ applied: false, reason: "Stale base" });
    let retainedExecute: (() => unknown) | undefined;
    expect(() =>
      applyPetrinautAiMutation({
        document: documentOf(instance),
        aiToolCall,
        toolCallId: "a3-failed",
        executeMutation: ({ execute }) => {
          retainedExecute = execute;
          throw new Error("Host refused");
        },
      }),
    ).toThrow("Host refused");
    expect(() => retainedExecute?.()).toThrow(/synchronous/u);
    expect(instance.definition.get().transitions[0]?.inputArcs).toHaveLength(0);
    instance.dispose();
  });

  test("calls the host boundary around a refused edit, whose execution reports the refusal and changes nothing", () => {
    const instance = createPetrinaut({
      document: createJsonDocHandle({ initial: definition }),
    });
    const { document } = createTestEditorApi(instance, {
      refusal: () => ({ kind: "host-readonly" }),
    });
    const executed: unknown[] = [];
    const output = applyPetrinautAiMutation({
      document,
      toolCallId: "read-only-arc",
      aiToolCall: {
        toolName: "addArc",
        input: {
          transitionId: "start",
          arcDirection: "input",
          placeId: "crew",
          weight: 1,
          type: "standard",
        },
      },
      executeMutation: ({ execute }) => {
        const result = execute();
        executed.push(result);
        return result;
      },
    });

    const refused = {
      applied: false,
      blocked: "host-readonly",
      reason: expect.any(String) as string,
    };
    expect(executed).toEqual([refused]);
    expect(output).toEqual(refused);
    expect(instance.definition.get().transitions[0]?.inputArcs).toEqual([]);
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

    const document = documentOf(instance);
    expect(applyPetrinautAiMutation({ aiToolCall: call, document })).toEqual(
      expect.objectContaining({ applied: true }),
    );
    expect(applyPetrinautAiMutation({ aiToolCall: call, document })).toEqual({
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

    const document = documentOf(instance);
    applyPetrinautAiMutation({
      aiToolCall: { ...endpoint, input: { ...endpoint.input, weight: 1 } },
      document,
    });
    const result = applyPetrinautAiMutation({
      aiToolCall: { ...endpoint, input: { ...endpoint.input, weight: 2 } },
      document,
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
        document: documentOf(instance),
      }),
    ).toThrow("`missing-place`");
    expect(instance.definition.get().transitions[0]?.inputArcs).toEqual([]);

    instance.dispose();
  });
});
