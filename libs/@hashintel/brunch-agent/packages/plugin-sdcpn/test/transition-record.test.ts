import { createHash } from "node:crypto";

import { describe, expect, test } from "vitest";

import {
  createJsonDocHandle,
  createPetrinaut,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import {
  assertArcEffects,
  deriveArcEffects,
  observedArcOutcome,
  reconcileArcTransitionAttempts,
  verifyArcTransitionAttempt,
  type ArcMutationRequest,
  type ArcTransitionAttempt,
} from "../src/transition-record";

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
const applied = (): ArcTransitionAttempt => {
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
    effects: deriveArcEffects(request, pre, post.definition),
  };
};

describe("root addArc transition semantics", () => {
  test("verifies actual canonical insertion and rejects missing or duplicated diff accounting", async () => {
    const attempt = applied();
    await verifyArcTransitionAttempt(attempt);
    const missing = structuredClone(attempt);
    missing.effects.created = [];
    expect(() => assertArcEffects(missing)).toThrow(/complete canonical diff/u);
    const duplicated = structuredClone(attempt);
    duplicated.effects.derived = duplicated.effects.created;
    expect(() => assertArcEffects(duplicated)).toThrow(
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
    const effects = deriveArcEffects(request, before, after);
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
    expect(observedArcOutcome(attempt)).toBe("unknown");
    assertArcEffects(attempt);
  });

  test("does not accept a different weight as the requested insertion", async () => {
    const attempt = applied();
    attempt.post!.definition.transitions[0]!.inputArcs[0]!.weight = 2;
    attempt.post = observe(attempt.post!.definition);
    attempt.effects = deriveArcEffects(request, pre, attempt.post.definition);
    expect(observedArcOutcome(attempt)).toBe("unknown");
    await expect(verifyArcTransitionAttempt(attempt)).rejects.toThrow(
      /outcome/u,
    );
  });

  test("does not attribute failed, no-op, stale or unknown attempts as applied changes", () => {
    const attempt = applied();
    const unchanged = {
      ...attempt,
      post: attempt.pre,
      effects: deriveArcEffects(request, pre, pre),
    };
    expect(observedArcOutcome(unchanged)).toBe("no-op");
    expect(observedArcOutcome({ ...unchanged, error: "Rejected" })).toBe(
      "failed",
    );
    expect(
      observedArcOutcome({
        ...unchanged,
        request: { ...request, requestedBaseHash: "0".repeat(64) },
      }),
    ).toBe("stale");
    expect(observedArcOutcome({ ...attempt, error: "Partial failure" })).toBe(
      "unknown",
    );
    expect(observedArcOutcome({ ...attempt, post: undefined })).toBe("unknown");
  });

  test("the first verified delivery stands unless a conflicting outcome makes it unknown", () => {
    const attempt = applied();
    expect(reconcileArcTransitionAttempts([attempt, attempt]).outcome).toBe(
      "applied",
    );
    const conflict = { ...attempt, outcome: "unknown" as const };
    expect(
      reconcileArcTransitionAttempts([attempt, conflict, attempt]),
    ).toMatchObject({
      outcome: "unknown",
      attempts: [attempt, conflict, attempt],
    });
    expect(() =>
      reconcileArcTransitionAttempts([
        attempt,
        { ...attempt, request: { ...request, toolCallId: "another-call" } },
      ]),
    ).toThrow(/different tool calls/u);
  });
});
