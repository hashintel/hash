import { createHash } from "node:crypto";

import { describe, expect, test } from "vitest";

import {
  createJsonDocHandle,
  createPetrinaut,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import {
  assertMutationEffects,
  classifyMutationOutcome,
  deriveMutationEffects,
  observedMutationOutcome,
  reconcileMutationAttempts,
  verifyMutationAttempt,
  type ArcMutationRequest,
  type ArcMutationAttempt,
  type ConstructionMutationAttempt,
  type ConstructionMutationRequest,
} from "../src/mutation-record";

const pre: SDCPN = {
  places: [
    {
      id: "a3-place",
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
      id: "a3-transition",
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
  differentialEquations: [],
  parameters: [],
};
const observe = (definition: SDCPN) => ({
  definition: structuredClone(definition),
  sha256: createHash("sha256").update(JSON.stringify(definition)).digest("hex"),
});
const request: ArcMutationRequest = {
  toolCallId: "a3-call",
  toolName: "addArc",
  binding: {
    documentId: "a3-doc",
    incarnationId: "a3-incarnation",
    conversationId: "a3-conversation",
  },
  requestedBaseHash: observe(pre).sha256,
  input: {
    transitionId: "a3-transition",
    arcDirection: "input",
    placeId: "a3-place",
    weight: 1,
    type: "standard",
  },
};
const applied = (): ArcMutationAttempt => {
  const instance = createPetrinaut({
    document: createJsonDocHandle({
      initial: pre,
      capabilities: { disabledExtensions: [] },
    }),
  });
  instance.mutations.addArc(request.input);
  const post = observe(instance.definition.get());
  instance.dispose();
  return {
    request: structuredClone(request),
    binding: request.binding,
    pre: observe(pre),
    post,
    outcome: "applied",
    effects: deriveMutationEffects(request, pre, post.definition),
  };
};

describe("root addArc transition semantics", () => {
  test("verifies actual canonical insertion and rejects missing or duplicated diff accounting", async () => {
    const attempt = applied();
    await verifyMutationAttempt(attempt);
    const missing = structuredClone(attempt);
    missing.effects.created = [];
    expect(() => assertMutationEffects(missing)).toThrow(
      /complete canonical diff/u,
    );
    const duplicated = structuredClone(attempt);
    duplicated.effects.derived = duplicated.effects.created;
    expect(() => assertMutationEffects(duplicated)).toThrow(
      /complete canonical diff/u,
    );
  });

  test("accounts for updated, deleted and unmapped fields without granting them the request's basis", () => {
    const before = applied().post!.definition;
    before.transitions[0]!.description = "Test-only description";
    const after = structuredClone(before);
    after.transitions[0]!.inputArcs[0]!.weight = 2;
    delete after.transitions[0]!.description;
    after.transitions[0]!.lambdaCode = "return false;";
    const effects = deriveMutationEffects(request, before, after);
    expect(effects.created).toEqual([]);
    expect(effects.updated).toEqual([
      {
        path: "/transitions/0/inputArcs/0/weight",
        kind: "updated",
        before: 1,
        after: 2,
      },
    ]);
    expect(effects.deleted).toEqual([]);
    expect(effects.derived).toEqual([
      {
        path: "/transitions/0/description",
        kind: "deleted",
        before: "Test-only description",
      },
      {
        path: "/transitions/0/lambdaCode",
        kind: "updated",
        before: "",
        after: "return false;",
      },
    ]);
    const attempt = {
      ...applied(),
      pre: observe(before),
      post: observe(after),
      effects,
    };
    expect(observedMutationOutcome(attempt)).toBe("unknown");
    assertMutationEffects(attempt);
  });

  test("does not accept a different weight as the requested insertion", async () => {
    const attempt = applied();
    attempt.post!.definition.transitions[0]!.inputArcs[0]!.weight = 2;
    attempt.post = observe(attempt.post!.definition);
    attempt.effects = deriveMutationEffects(
      request,
      pre,
      attempt.post.definition,
    );
    expect(observedMutationOutcome(attempt)).toBe("unknown");
    await expect(verifyMutationAttempt(attempt)).rejects.toThrow(/outcome/u);
  });

  test("explains an unknown node outcome when the expected definition cannot be derived", () => {
    const attempt = applied();
    const nested: ConstructionMutationAttempt = {
      ...attempt,
      request: {
        ...attempt.request,
        toolName: "updatePlace",
        input: {
          placeId: "a3-place",
          targetSubnetId: "a3-subnet",
          update: { name: "Renamed" },
        },
      },
    };
    const classified = classifyMutationOutcome(nested);
    expect(classified.outcome).toBe("unknown");
    expect(classified.reason).toMatch(
      /^expected definition unavailable: Nested construction is unavailable/u,
    );
    // The projection is unchanged: callers that only want the outcome see `unknown`.
    expect(observedMutationOutcome(nested)).toBe("unknown");
    // A derivable node outcome carries no reason.
    expect(classifyMutationOutcome(attempt)).toEqual({ outcome: "applied" });
  });

  test("does not attribute failed, no-op, stale or unknown attempts as applied changes", () => {
    const attempt = applied();
    const unchanged = {
      ...attempt,
      post: attempt.pre,
      effects: deriveMutationEffects(request, pre, pre),
    };
    expect(observedMutationOutcome(unchanged)).toBe("no-op");
    expect(observedMutationOutcome({ ...unchanged, error: "Rejected" })).toBe(
      "failed",
    );
    expect(
      observedMutationOutcome({
        ...unchanged,
        request: { ...request, requestedBaseHash: "0".repeat(64) },
      }),
    ).toBe("stale");
    expect(
      observedMutationOutcome({ ...attempt, error: "Partial failure" }),
    ).toBe("unknown");
    expect(observedMutationOutcome({ ...attempt, post: undefined })).toBe(
      "unknown",
    );
  });

  test("verifies a direct place removal and keeps its cascading arc deletion derived", async () => {
    const before = applied().post!.definition;
    const removePlaceInput = { placeId: "a3-place" };
    const removeRequest: ConstructionMutationRequest = {
      ...request,
      toolCallId: "remove-place",
      toolName: "removePlace",
      requestedBaseHash: observe(before).sha256,
      input: removePlaceInput,
    };
    const instance = createPetrinaut({
      document: createJsonDocHandle({
        initial: before,
        capabilities: { disabledExtensions: [] },
      }),
    });
    instance.mutations.removePlace(removePlaceInput);
    const post = observe(instance.definition.get());
    instance.dispose();
    const attempt: ConstructionMutationAttempt = {
      request: removeRequest,
      binding: removeRequest.binding,
      pre: observe(before),
      post,
      outcome: "applied",
      effects: deriveMutationEffects(removeRequest, before, post.definition),
    };

    expect(
      attempt.effects.deleted.map(({ kind, path }) => ({ kind, path })),
    ).toEqual([
      {
        path: "/places/0",
        kind: "deleted",
      },
    ]);
    expect(
      attempt.effects.derived.map(({ kind, path }) => ({ kind, path })),
    ).toEqual([
      {
        path: "/transitions/0/inputArcs/0",
        kind: "deleted",
      },
    ]);
    expect(classifyMutationOutcome(attempt)).toEqual({ outcome: "applied" });
    await verifyMutationAttempt(attempt);
  });

  test("derives a dynamics-code update as a direct field change", () => {
    const before: SDCPN = {
      places: [],
      transitions: [],
      types: [
        {
          id: "item",
          name: "Item",
          iconSlug: "circle",
          displayColor: "#1E90FF",
          elements: [],
        },
      ],
      differentialEquations: [
        {
          id: "decay",
          name: "Decay",
          colorId: "item",
          code: "return definitelyNotDefined;",
        },
      ],
      parameters: [],
    };
    const updateRequest: ConstructionMutationRequest = {
      toolCallId: "repair-decay",
      toolName: "updateDifferentialEquation",
      binding: request.binding,
      requestedBaseHash: observe(before).sha256,
      input: {
        equationId: "decay",
        update: { code: "return tokens.map(() => ({}));" },
      },
    };
    const instance = createPetrinaut({
      document: createJsonDocHandle({
        initial: before,
        capabilities: { disabledExtensions: [] },
      }),
    });
    instance.mutations.updateDifferentialEquation(updateRequest.input);
    const after = instance.definition.get();
    instance.dispose();
    const effects = deriveMutationEffects(updateRequest, before, after);
    expect(effects.updated).toEqual([
      expect.objectContaining({
        path: "/differentialEquations/0/code",
        kind: "updated",
      }),
    ]);
    expect(
      classifyMutationOutcome({
        request: updateRequest,
        binding: updateRequest.binding,
        pre: observe(before),
        post: observe(after),
        effects,
      }),
    ).toEqual({ outcome: "applied" });
  });

  test("the first verified delivery stands unless a conflicting outcome makes it unknown", () => {
    const attempt = applied();
    expect(reconcileMutationAttempts([attempt, attempt]).outcome).toBe(
      "applied",
    );
    const conflict = { ...attempt, outcome: "unknown" as const };
    expect(
      reconcileMutationAttempts([attempt, conflict, attempt]),
    ).toMatchObject({
      outcome: "unknown",
      attempts: [attempt, conflict, attempt],
    });
    expect(() =>
      reconcileMutationAttempts([
        attempt,
        { ...attempt, request: { ...request, toolCallId: "another-call" } },
      ]),
    ).toThrow(/different tool calls/u);
  });
});
