import { describe, expect, test, vi } from "vitest";

import {
  createJsonDocHandle,
  createPetrinaut,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import {
  createMutatePetrinetAutomaticTool,
  type MutatePetrinetOperationFailure,
  mutatePetrinetOutputSchema,
} from "./mutate-petrinet-tool";
import { observeBrowserDefinition } from "./mutation-record";

const hash = "a".repeat(64);
const binding = {
  conversationId: "conversation",
  documentId: "document",
  incarnationId: "incarnation",
};
const emptyDefinition: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};
const createInstance = (initial: SDCPN = emptyDefinition) =>
  createPetrinaut({
    document: createJsonDocHandle({
      id: binding.documentId,
      initial: structuredClone(initial),
    }),
  });
const basis = {
  basisId: "basis-1",
  basis: { kind: "absent" as const, reason: "Synthetic tracer" },
};
const place = {
  operationId: "add-queue",
  type: "addPlace" as const,
  input: {
    id: "queue",
    name: "Queue",
    colorId: null,
    dynamicsEnabled: false,
    differentialEquationId: null,
    x: 0,
    y: 0,
  },
};
const transition = {
  operationId: "add-start",
  type: "addTransition" as const,
  input: {
    id: "start",
    name: "Start",
    metadata: {},
    inputArcs: [],
    outputArcs: [],
    lambdaType: "predicate" as const,
    lambdaCode: "",
    transitionKernelCode: "",
    x: 100,
    y: 0,
  },
};
const arc = {
  operationId: "wire-queue",
  type: "addArc" as const,
  input: {
    transitionId: "start",
    arcDirection: "input" as const,
    placeId: "queue",
    weight: 1,
    type: "standard" as const,
  },
};

const removePlace = {
  operationId: "remove-queue",
  type: "removePlace" as const,
  input: { placeId: "queue" },
};
const removeTransition = {
  operationId: "remove-start",
  type: "removeTransition" as const,
  input: { transitionId: "start" },
};
const removeArc = {
  operationId: "unwire-queue",
  type: "removeArc" as const,
  input: {
    transitionId: "start",
    arcDirection: "input" as const,
    placeId: "queue",
  },
};

const inputFor = (
  instance: ReturnType<typeof createInstance>,
  operations: readonly (
    | typeof place
    | typeof transition
    | typeof arc
    | typeof removePlace
    | typeof removeTransition
    | typeof removeArc
  )[],
) => {
  const observed = observeBrowserDefinition(instance.handle);
  return {
    observation: { toolCallId: "read-1", baseHash: observed.sha256 },
    bases: [basis],
    operations: operations.map((operation) => ({
      basisId: basis.basisId,
      ...operation,
    })),
  };
};

describe("mutate_petrinet automatic host tool", () => {
  test("executes created-ID dependencies and records complete structural outcomes", async () => {
    const instance = createInstance();
    const tool = createMutatePetrinetAutomaticTool(binding);

    const output = mutatePetrinetOutputSchema.parse(
      await tool.execute({
        input: inputFor(instance, [place, transition, arc]),
        instance,
        toolCallId: "batch-1",
      }),
    );

    expect(output.outcomes.map(({ status }) => status)).toEqual([
      "applied",
      "applied",
      "applied",
    ]);
    expect(output.outcomes.map(({ operationId }) => operationId)).toEqual([
      "add-queue",
      "add-start",
      "wire-queue",
    ]);
    expect(
      output.outcomes.every((outcome) =>
        outcome.status === "applied" ? outcome.effects.length > 0 : false,
      ),
    ).toBe(true);
    expect(instance.definition.get()).toMatchObject({
      places: [{ id: "queue" }],
      transitions: [
        { id: "start", inputArcs: [{ placeId: "queue", weight: 1 }] },
      ],
    });
    instance.dispose();
  });

  test("removes a place, its connected arcs, and a transition", async () => {
    const instance = createInstance();
    const tool = createMutatePetrinetAutomaticTool(binding);
    await tool.execute({
      input: inputFor(instance, [place, transition, arc]),
      instance,
      toolCallId: "batch-setup-remove",
    });

    const output = mutatePetrinetOutputSchema.parse(
      await tool.execute({
        input: inputFor(instance, [removePlace, removeTransition]),
        instance,
        toolCallId: "batch-remove",
      }),
    );

    expect(output.outcomes.map(({ status }) => status)).toEqual([
      "applied",
      "applied",
    ]);
    const removedPlace = output.outcomes.find(
      ({ operationId }) => operationId === removePlace.operationId,
    );
    const removedTransition = output.outcomes.find(
      ({ operationId }) => operationId === removeTransition.operationId,
    );
    if (removedPlace?.status !== "applied") {
      throw new Error("Expected an applied place removal.");
    }
    if (removedTransition?.status !== "applied") {
      throw new Error("Expected an applied transition removal.");
    }
    expect(
      removedPlace.effects.map(({ classification, kind, path }) => ({
        classification,
        kind,
        path,
      })),
    ).toEqual([
      {
        classification: "direct",
        kind: "deleted",
        path: "/places/0",
      },
      {
        classification: "derived",
        kind: "deleted",
        path: "/transitions/0/inputArcs/0",
      },
    ]);
    expect(
      removedTransition.effects.map(({ classification, kind, path }) => ({
        classification,
        kind,
        path,
      })),
    ).toEqual([
      {
        classification: "direct",
        kind: "deleted",
        path: "/transitions/0",
      },
    ]);
    expect(instance.definition.get()).toMatchObject({
      places: [],
      transitions: [],
    });
    instance.dispose();
  });

  test("removes one arc without deleting its endpoints", async () => {
    const instance = createInstance();
    const tool = createMutatePetrinetAutomaticTool(binding);
    await tool.execute({
      input: inputFor(instance, [place, transition, arc]),
      instance,
      toolCallId: "batch-setup-unwire",
    });

    const output = mutatePetrinetOutputSchema.parse(
      await tool.execute({
        input: inputFor(instance, [removeArc]),
        instance,
        toolCallId: "batch-unwire",
      }),
    );

    expect(output.outcomes.map(({ status }) => status)).toEqual(["applied"]);
    const outcome = output.outcomes.at(0);
    if (outcome?.status !== "applied") {
      throw new Error("Expected an applied arc removal.");
    }
    expect(
      outcome.effects.map(({ classification, kind, path }) => ({
        classification,
        kind,
        path,
      })),
    ).toEqual([
      {
        classification: "direct",
        kind: "deleted",
        path: "/transitions/0/inputArcs/0",
      },
    ]);
    expect(instance.definition.get()).toMatchObject({
      places: [{ id: "queue" }],
      transitions: [{ id: "start", inputArcs: [], outputArcs: [] }],
    });
    instance.dispose();
  });

  test("keeps the exact prefix and identifies the unattempted suffix", async () => {
    const instance = createInstance();
    const tool = createMutatePetrinetAutomaticTool(binding);
    const invalidArc = {
      ...arc,
      operationId: "wire-missing",
      input: { ...arc.input, placeId: "missing" },
    };
    const laterPlace = {
      ...place,
      operationId: "add-later",
      input: { ...place.input, id: "later", name: "Later" },
    };

    const output = mutatePetrinetOutputSchema.parse(
      await tool.execute({
        input: inputFor(instance, [place, transition, invalidArc, laterPlace]),
        instance,
        toolCallId: "batch-2",
      }),
    );

    expect(output.outcomes.map(({ status }) => status)).toEqual([
      "applied",
      "applied",
      "failed",
      "unattempted",
    ]);
    expect(instance.definition.get().places.map(({ id }) => id)).toEqual([
      "queue",
    ]);
    expect(output.outcomes[2]).toMatchObject({
      operationId: "wire-missing",
      preHash: output.postHash,
      postHash: output.postHash,
    });
    instance.dispose();
  });

  test("hands the host the thrown value behind a failed operation without changing the outcome", async () => {
    const instance = createInstance();
    const onOperationFailure =
      vi.fn<(failure: MutatePetrinetOperationFailure) => void>();
    const tool = createMutatePetrinetAutomaticTool(binding, {
      onOperationFailure,
    });
    const invalidArc = {
      ...arc,
      operationId: "wire-missing",
      input: { ...arc.input, placeId: "missing" },
    };

    const output = mutatePetrinetOutputSchema.parse(
      await tool.execute({
        input: inputFor(instance, [place, transition, invalidArc]),
        instance,
        toolCallId: "batch-report",
      }),
    );

    expect(output.outcomes.map(({ status }) => status)).toEqual([
      "applied",
      "applied",
      "failed",
    ]);
    expect(onOperationFailure).toHaveBeenCalledOnce();
    expect(onOperationFailure).toHaveBeenCalledWith({
      toolCallId: "batch-report",
      operationId: "wire-missing",
      operationType: "addArc",
      status: "failed",
      error: expect.any(Error) as unknown,
    });
    instance.dispose();
  });

  test("reports an unchanged duplicate arc as a no-op", async () => {
    const instance = createInstance();
    const tool = createMutatePetrinetAutomaticTool(binding);
    await tool.execute({
      input: inputFor(instance, [place, transition, arc]),
      instance,
      toolCallId: "batch-setup",
    });

    const output = mutatePetrinetOutputSchema.parse(
      await tool.execute({
        input: inputFor(instance, [{ ...arc, operationId: "repeat-arc" }]),
        instance,
        toolCallId: "batch-3",
      }),
    );

    expect(output.outcomes).toEqual([
      expect.objectContaining({
        operationId: "repeat-arc",
        status: "no-op",
        effects: [],
      }),
    ]);
    instance.dispose();
  });

  test("fails closed on malformed or incomplete indexed output", () => {
    expect(() =>
      mutatePetrinetOutputSchema.parse({
        execution: "ordered-stop",
        toolCallId: "outer-1",
        observationToolCallId: "read-1",
        preHash: hash,
        postHash: hash,
        outcomes: [
          {
            index: 0,
            operationId: "failed",
            basisId: "basis-1",
            status: "failed",
            preHash: hash,
            postHash: hash,
            error: "conflict",
          },
          {
            index: 2,
            operationId: "skipped",
            basisId: "basis-1",
            status: "unattempted",
          },
        ],
      }),
    ).toThrow(/complete and ordered/u);
  });
});
