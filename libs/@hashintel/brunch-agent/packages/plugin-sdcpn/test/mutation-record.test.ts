import { createHash } from "node:crypto";

import { describe, expect, test } from "vitest";

import {
  createJsonDocHandle,
  createPetrinaut,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import {
  isLayoutPetrinautNetToolName,
  isReadPetrinautDiagnosticsToolName,
  isReadPetrinautNetToolName,
  layoutPetrinautNetToolName,
  readPetrinautDiagnosticsToolName,
  readPetrinautNetToolName,
} from "../src/construction-tool-names";
import {
  isMutatePetrinautNetToolName,
  mutatePetrinautNetToolName,
} from "../src/mutate-petrinet";
import {
  assertMutationEffects,
  canonicalContent,
  classifyMutationOutcome,
  deriveLayoutEffects,
  deriveMutationEffects,
  expectedNodeDefinition,
  isHostRecordedCanonicalMutation,
  isHostRecordedCanonicalMutationName,
  observedMutationOutcome,
  parseClientToolResultMetadata,
  reconcileMutationAttempts,
  verifyCanonicalMutationRecord,
  verifyDeepConstructionRecord,
  verifyExperimentRecord,
  verifyMutationAttempt,
  type ArcMutationRequest,
  type ArcMutationAttempt,
  type ConstructionMutationAttempt,
  type ConstructionMutationRequest,
} from "../src/mutation-record";
import {
  isReadPetrinautDocsToolName,
  READ_PETRINAUT_DOCS_TOOL_NAME,
} from "../src/tools/read-petrinaut-doc";

test("uses the selected Brunch Petrinaut family and recognizes only canonical names", () => {
  expect([
    readPetrinautNetToolName,
    READ_PETRINAUT_DOCS_TOOL_NAME,
    readPetrinautDiagnosticsToolName,
    layoutPetrinautNetToolName,
    mutatePetrinautNetToolName,
  ]).toEqual([
    "read_petrinaut_net",
    "read_petrinaut_docs",
    "read_petrinaut_diagnostics",
    "layout_petrinaut_net",
    "mutate_petrinaut_net",
  ]);
  expect(isReadPetrinautNetToolName(readPetrinautNetToolName)).toBe(true);
  expect(isMutatePetrinautNetToolName(mutatePetrinautNetToolName)).toBe(true);
  expect(isReadPetrinautNetToolName("getLatestNetDefinition")).toBe(false);
  expect(isReadPetrinautDocsToolName("readPetrinautDoc")).toBe(false);
  expect(isReadPetrinautDiagnosticsToolName("getNetCompilationErrors")).toBe(
    false,
  );
  expect(isLayoutPetrinautNetToolName("applyAutoLayout")).toBe(false);
  expect(isMutatePetrinautNetToolName("mutate_petrinet")).toBe(false);
});

const pre: SDCPN = {
  places: [
    {
      id: "a3-place",
      name: "Buffer",
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
test.each([
  [
    "root addPlace",
    "addPlace",
    { ...pre.places[0], targetSubnetId: null },
    true,
  ],
  [
    "nested addPlace",
    "addPlace",
    { ...pre.places[0], targetSubnetId: "subnet-1" },
    false,
  ],
  [
    "root addTransition",
    "addTransition",
    { ...pre.transitions[0], targetSubnetId: null },
    true,
  ],
  [
    "nested addTransition",
    "addTransition",
    { ...pre.transitions[0], targetSubnetId: "subnet-1" },
    false,
  ],
  ["root addArc", "addArc", { ...request.input, targetSubnetId: null }, true],
  [
    "nested addArc",
    "addArc",
    { ...request.input, targetSubnetId: "subnet-1" },
    false,
  ],
  [
    "component-port addArc",
    "addArc",
    {
      transitionId: "a3-transition",
      arcDirection: "input",
      endpoint: {
        kind: "componentPort",
        componentInstanceId: "component-1",
        portPlaceId: "port-1",
      },
      weight: 1,
      type: "standard",
      targetSubnetId: null,
    },
    false,
  ],
  ["malformed recorded name", "addPlace", { id: "only-an-id" }, false],
  ["non-recorded name", "addParameter", { malformed: true }, false],
] as const)(
  "classifies the exact host-observed scope: $0",
  (_label, toolName, input, expected) => {
    expect(isHostRecordedCanonicalMutation(toolName, input)).toBe(expected);
  },
);

test("keeps the name-only host-recording predicate", () => {
  expect(isHostRecordedCanonicalMutationName("addPlace")).toBe(true);
  expect(isHostRecordedCanonicalMutationName("addParameter")).toBe(false);
});

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

  test("rejects a no-op record whose arc names a missing transition", async () => {
    const missingTransitionRequest: ArcMutationRequest = {
      ...request,
      toolCallId: "missing-transition-call",
      input: { ...request.input, transitionId: "missing-transition" },
    };
    const unchanged = observe(pre);
    const attempt: ArcMutationAttempt = {
      request: missingTransitionRequest,
      binding: missingTransitionRequest.binding,
      pre: unchanged,
      post: unchanged,
      outcome: "no-op",
      effects: deriveMutationEffects(
        missingTransitionRequest,
        pre,
        unchanged.definition,
      ),
    };

    await expect(verifyMutationAttempt(attempt)).rejects.toThrow(
      "not supported by its observations",
    );
  });

  test("accepts the exact canonical colored output-arc footprint including generated kernel code", async () => {
    const before: SDCPN = {
      ...structuredClone(pre),
      places: [{ ...pre.places[0]!, colorId: "item" }],
      types: [
        {
          id: "item",
          name: "Item",
          iconSlug: "circle",
          displayColor: "#1E90FF",
          elements: [],
        },
      ],
    };
    const outputRequest: ArcMutationRequest = {
      ...request,
      requestedBaseHash: observe(before).sha256,
      input: {
        transitionId: "a3-transition",
        arcDirection: "output",
        placeId: "a3-place",
        weight: 1,
      },
    };
    const instance = createPetrinaut({
      document: createJsonDocHandle({
        initial: before,
        capabilities: { disabledExtensions: [] },
      }),
    });
    instance.mutations.addArc(outputRequest.input);
    const post = observe(instance.definition.get());
    instance.dispose();
    const effects = deriveMutationEffects(
      outputRequest,
      before,
      post.definition,
    );
    const attempt: ArcMutationAttempt = {
      request: outputRequest,
      binding: outputRequest.binding,
      pre: observe(before),
      post,
      outcome: "applied",
      effects,
    };

    expect(post.definition.transitions[0]?.transitionKernelCode).not.toBe("");
    expect(effects.created).toEqual([
      expect.objectContaining({
        path: "/transitions/0/outputArcs/0",
        kind: "created",
      }),
    ]);
    expect(effects.derived).toEqual([
      expect.objectContaining({
        path: "/transitions/0/transitionKernelCode",
        kind: "updated",
      }),
    ]);
    expect(observedMutationOutcome(attempt)).toBe("applied");
    await expect(verifyMutationAttempt(attempt)).resolves.toMatchObject({
      outcome: "applied",
    });

    const unrelated = structuredClone(attempt);
    unrelated.post!.definition.transitions[0]!.name = "Unaccounted rename";
    unrelated.post = observe(unrelated.post!.definition);
    unrelated.effects = deriveMutationEffects(
      outputRequest,
      before,
      unrelated.post.definition,
    );
    unrelated.outcome = "unknown";
    expect(observedMutationOutcome(unrelated)).toBe("unknown");
    await expect(verifyMutationAttempt(unrelated)).resolves.toMatchObject({
      outcome: "unknown",
    });
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
    const duplicateRequest = {
      ...request,
      requestedBaseHash: attempt.post!.sha256,
    };
    const unchanged = {
      ...attempt,
      request: duplicateRequest,
      pre: attempt.post!,
      post: attempt.post!,
      effects: deriveMutationEffects(
        duplicateRequest,
        attempt.post!.definition,
        attempt.post!.definition,
      ),
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
    const repairInput = {
      equationId: "decay",
      update: { code: "return tokens.map(() => ({}));" },
    };
    const updateRequest: ConstructionMutationRequest = {
      toolCallId: "repair-decay",
      toolName: "updateDifferentialEquation",
      binding: request.binding,
      requestedBaseHash: observe(before).sha256,
      input: repairInput,
    };
    const instance = createPetrinaut({
      document: createJsonDocHandle({
        initial: before,
        capabilities: { disabledExtensions: [] },
      }),
    });
    instance.mutations.updateDifferentialEquation(repairInput);
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

  test("derives a parameter edit as a direct field change on the located parameter", () => {
    const before: SDCPN = {
      places: [],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [
        {
          id: "lead-time",
          name: "Lead time",
          variableName: "lead_time",
          type: "real",
          defaultValue: "3",
        },
      ],
    };
    const editInput = {
      parameterId: "lead-time",
      update: { variableName: "lead_time_days", defaultValue: "5" },
    };
    const editRequest: ConstructionMutationRequest = {
      toolCallId: "edit-lead-time",
      toolName: "updateParameter",
      binding: request.binding,
      requestedBaseHash: observe(before).sha256,
      input: editInput,
    };
    const instance = createPetrinaut({
      document: createJsonDocHandle({
        initial: before,
        capabilities: { disabledExtensions: [] },
      }),
    });
    instance.mutations.updateParameter(editInput);
    const after = instance.definition.get();
    instance.dispose();
    const effects = deriveMutationEffects(editRequest, before, after);
    expect(effects.updated.map((change) => change.path).sort()).toEqual([
      "/parameters/0/defaultValue",
      "/parameters/0/variableName",
    ]);
    expect(effects.derived).toEqual([]);
    expect(
      classifyMutationOutcome({
        request: editRequest,
        binding: editRequest.binding,
        pre: observe(before),
        post: observe(after),
        effects,
      }),
    ).toEqual({ outcome: "applied" });
  });

  test("derives a type removal as one direct deletion and keeps the cleared place reference derived", () => {
    const before: SDCPN = {
      places: [{ ...pre.places[0]!, colorId: "item" }],
      transitions: [],
      types: [
        {
          id: "item",
          name: "Item",
          iconSlug: "circle",
          displayColor: "#1E90FF",
          elements: [{ elementId: "age", name: "age", type: "real" }],
        },
      ],
      differentialEquations: [],
      parameters: [
        {
          id: "rate",
          name: "Rate",
          variableName: "rate",
          type: "real",
          defaultValue: "1",
        },
      ],
    };
    const cases: {
      toolName: ConstructionMutationRequest["toolName"];
      input: ConstructionMutationRequest["input"];
      path: string;
      apply: (
        mutations: ReturnType<typeof createPetrinaut>["mutations"],
      ) => void;
      derivedPaths: string[];
    }[] = [
      {
        toolName: "removeType",
        input: { typeId: "item" },
        path: "/types/0",
        apply: (mutations) => mutations.removeType({ typeId: "item" }),
        derivedPaths: ["/places/0/colorId"],
      },
      {
        toolName: "removeTypeElement",
        input: { typeId: "item", elementId: "age" },
        path: "/types/0/elements/0",
        apply: (mutations) =>
          mutations.removeTypeElement({ typeId: "item", elementId: "age" }),
        derivedPaths: [],
      },
      {
        toolName: "removeParameter",
        input: { parameterId: "rate" },
        path: "/parameters/0",
        apply: (mutations) =>
          mutations.removeParameter({ parameterId: "rate" }),
        derivedPaths: [],
      },
    ];
    for (const { toolName, input, path, apply, derivedPaths } of cases) {
      const removeRequest: ConstructionMutationRequest = {
        toolCallId: `drop-${toolName}`,
        toolName,
        binding: request.binding,
        requestedBaseHash: observe(before).sha256,
        input,
      };
      const instance = createPetrinaut({
        document: createJsonDocHandle({
          initial: before,
          capabilities: { disabledExtensions: [] },
        }),
      });
      apply(instance.mutations);
      const after = instance.definition.get();
      instance.dispose();
      const effects = deriveMutationEffects(removeRequest, before, after);
      expect(effects.deleted.map((change) => change.path)).toEqual([path]);
      expect(effects.created).toEqual([]);
      expect(effects.updated).toEqual([]);
      expect(effects.derived.map((change) => change.path)).toEqual(
        derivedPaths,
      );
      expect(
        classifyMutationOutcome({
          request: removeRequest,
          binding: removeRequest.binding,
          pre: observe(before),
          post: observe(after),
          effects,
        }),
      ).toEqual({ outcome: "applied" });
    }
  });

  test("a referenced removal accounts for every canonical cascade as derived and still verifies applied", () => {
    const before: SDCPN = {
      places: [
        {
          ...pre.places[0]!,
          colorId: "item",
          dynamicsEnabled: true,
          differentialEquationId: "decay",
        },
      ],
      transitions: [],
      types: [
        {
          id: "item",
          name: "Item",
          iconSlug: "circle",
          displayColor: "#1E90FF",
          elements: [{ elementId: "level", name: "level", type: "real" }],
        },
      ],
      differentialEquations: [
        {
          id: "decay",
          name: "Decay",
          colorId: "item",
          code: "return tokens.map(({ level }) => ({ level: -level }));",
        },
      ],
      parameters: [],
    };
    const cases: {
      toolName: ConstructionMutationRequest["toolName"];
      input: ConstructionMutationRequest["input"];
      path: string;
      apply: (
        mutations: ReturnType<typeof createPetrinaut>["mutations"],
      ) => void;
      derivedPaths: string[];
    }[] = [
      {
        toolName: "removeDifferentialEquation",
        input: { equationId: "decay" },
        path: "/differentialEquations/0",
        apply: (mutations) =>
          mutations.removeDifferentialEquation({ equationId: "decay" }),
        derivedPaths: ["/places/0/differentialEquationId"],
      },
      {
        toolName: "removeType",
        input: { typeId: "item" },
        path: "/types/0",
        apply: (mutations) => mutations.removeType({ typeId: "item" }),
        derivedPaths: ["/differentialEquations/0/colorId", "/places/0/colorId"],
      },
    ];
    for (const { toolName, input, path, apply, derivedPaths } of cases) {
      const removeRequest: ConstructionMutationRequest = {
        toolCallId: `drop-referenced-${toolName}`,
        toolName,
        binding: request.binding,
        requestedBaseHash: observe(before).sha256,
        input,
      };
      const instance = createPetrinaut({
        document: createJsonDocHandle({
          initial: before,
          capabilities: { disabledExtensions: [] },
        }),
      });
      apply(instance.mutations);
      const after = instance.definition.get();
      instance.dispose();
      const effects = deriveMutationEffects(removeRequest, before, after);
      expect(effects.deleted.map((change) => change.path)).toEqual([path]);
      // The cascade is what Petrinaut actually cleared, recorded in full and
      // never granted the removal's basis.
      expect(effects.derived.map((change) => change.path).sort()).toEqual(
        derivedPaths,
      );
      expect(
        [
          ...effects.created,
          ...effects.updated,
          ...effects.deleted,
          ...effects.derived,
        ].length,
      ).toBe(1 + derivedPaths.length);
      expect(
        classifyMutationOutcome({
          request: removeRequest,
          binding: removeRequest.binding,
          pre: observe(before),
          post: observe(after),
          effects,
        }),
      ).toEqual({ outcome: "applied" });
      // A record that hides part of the cascade is refused at the boundary.
      expect(() =>
        assertMutationEffects({
          request: removeRequest,
          binding: removeRequest.binding,
          pre: observe(before),
          post: observe(after),
          outcome: "applied",
          effects: { ...effects, derived: [] },
        }),
      ).toThrow(/complete canonical diff/u);
    }
  });

  test("derives an input arc type change as one direct arc field update", () => {
    const before = applied().post!.definition;
    const typeInput = {
      transitionId: "a3-transition",
      placeId: "a3-place",
      type: "inhibitor" as const,
    };
    const typeRequest: ConstructionMutationRequest = {
      toolCallId: "inhibit",
      toolName: "updateArcType",
      binding: request.binding,
      requestedBaseHash: observe(before).sha256,
      input: typeInput,
    };
    const instance = createPetrinaut({
      document: createJsonDocHandle({
        initial: before,
        capabilities: { disabledExtensions: [] },
      }),
    });
    instance.mutations.updateArcType(typeInput);
    const after = instance.definition.get();
    instance.dispose();
    const effects = deriveMutationEffects(typeRequest, before, after);
    expect(effects.updated).toEqual([
      {
        path: "/transitions/0/inputArcs/0/type",
        kind: "updated",
        before: "standard",
        after: "inhibitor",
      },
    ]);
    expect(effects.derived).toEqual([]);
    expect(
      classifyMutationOutcome({
        request: typeRequest,
        binding: typeRequest.binding,
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

describe("canonical experiment sidecars", () => {
  const input = {
    name: "Baseline",
    scenarioId: "scenario-1",
    scenarioParameterValues: {},
    runCount: 10,
    seed: 42,
    dt: 0.1,
    maxTime: 10,
    metricIds: ["throughput"],
    execution: { mode: "simulate" as const },
  };
  const source = { ...observe(pre), revisionId: "source-revision" };
  const result = (status: "complete" | "cancelled" | "error") => ({
    status,
    experimentId: status === "error" ? null : "experiment-1",
    name: input.name,
    ...(status === "complete" ? {} : { message: `${status} terminal result` }),
    runsCompleted: status === "complete" ? 10 : 3,
    metrics: [
      {
        id: "throughput",
        label: "Throughput",
        value: status === "complete" ? 4 : null,
      },
    ],
  });
  const record = (status: "complete" | "cancelled" | "error") => ({
    toolCallId: "experiment-call",
    binding: request.binding,
    input,
    source,
    output: result(status),
  });
  const verify = (candidate: unknown, canonicalOutput: unknown) =>
    verifyExperimentRecord({
      record: candidate,
      toolCallId: "experiment-call",
      canonicalInput: input,
      canonicalOutput,
      binding: request.binding,
    });

  test.each(["complete", "cancelled", "error"] as const)(
    "verifies the canonical %s terminal result over the frozen source revision",
    async (status) => {
      await expect(
        verify(record(status), result(status)),
      ).resolves.toMatchObject({
        source: { revisionId: "source-revision", sha256: source.sha256 },
        output: { status },
      });
    },
  );

  test("rejects source, request, result, call and binding mismatches", async () => {
    const valid = record("complete");
    const cases = [
      { ...valid, toolCallId: "another-call" },
      {
        ...valid,
        binding: { ...valid.binding, documentId: "another-document" },
      },
      { ...valid, input: { ...valid.input, runCount: 11 } },
      { ...valid, output: { ...valid.output, runsCompleted: 9 } },
      { ...valid, source: { ...valid.source, sha256: "0".repeat(64) } },
      { ...valid, source: { ...valid.source, revisionId: "" } },
    ];
    for (const candidate of cases) {
      // eslint-disable-next-line no-await-in-loop -- Each candidate is an independent boundary case.
      await expect(verify(candidate, result("complete"))).rejects.toThrow(/./u);
    }
    await expect(
      verify(valid, { ...result("complete"), runsCompleted: 9 }),
    ).rejects.toThrow(/output/u);
  });

  test("rejects non-terminal progress and non-canonical dispositions", async () => {
    const valid = record("complete");
    await expect(
      verify(
        { ...valid, output: { ...valid.output, status: "running" } },
        {
          ...valid.output,
          status: "running",
        },
      ),
    ).rejects.toThrow(/./u);
  });
});

describe("canonical single-mutation sidecars", () => {
  const canonicalRecord = () => {
    const attempt = applied();
    attempt.pre.revisionId = "revision-1";
    attempt.post!.revisionId = "revision-2";
    return {
      toolCallId: request.toolCallId,
      toolName: request.toolName,
      binding: request.binding,
      input: request.input,
      pre: attempt.pre,
      post: attempt.post,
      outcome: "applied" as const,
      effects: attempt.effects,
      settlement: { status: "settled" as const, revisionId: "revision-2" },
      diagnostics: { status: "not-required" as const },
      output: { success: true },
    };
  };
  const verify = (
    record: unknown,
    overrides: Partial<{
      toolCallId: string;
      toolName: string;
      canonicalInput: unknown;
      canonicalOutput: unknown;
    }> = {},
  ) =>
    verifyCanonicalMutationRecord({
      record,
      toolCallId: overrides.toolCallId ?? request.toolCallId,
      toolName: overrides.toolName ?? request.toolName,
      canonicalInput: overrides.canonicalInput ?? request.input,
      canonicalOutput: overrides.canonicalOutput ?? { success: true },
      binding: request.binding,
    });

  test("verifies applied and conservative no-op records without replacing the legacy batch sidecar", async () => {
    await expect(verify(canonicalRecord())).resolves.toMatchObject({
      outcome: "applied",
      post: { revisionId: "revision-2" },
    });

    const addPlaceInput = structuredClone(pre.places[0]!);
    const noOpRequest: ConstructionMutationRequest = {
      toolCallId: "canonical-add-place-no-op",
      toolName: "addPlace",
      binding: request.binding,
      input: addPlaceInput,
      requestedBaseHash: observe(pre).sha256,
    };
    const unchanged = { ...observe(pre), revisionId: "revision-1" };
    const noOpOutput = { applied: false, reason: "The place already exists." };
    const noOpRecord = {
      toolCallId: noOpRequest.toolCallId,
      toolName: noOpRequest.toolName,
      binding: noOpRequest.binding,
      input: noOpRequest.input,
      pre: unchanged,
      post: unchanged,
      outcome: "no-op" as const,
      effects: deriveMutationEffects(noOpRequest, pre, pre),
      settlement: { status: "not-required" as const },
      diagnostics: { status: "not-required" as const },
      output: noOpOutput,
    };
    const noOpVerification = {
      toolCallId: noOpRequest.toolCallId,
      toolName: noOpRequest.toolName,
      canonicalInput: noOpRequest.input,
      canonicalOutput: noOpOutput,
    };
    await expect(verify(noOpRecord, noOpVerification)).resolves.toMatchObject({
      outcome: "no-op",
    });

    const reserialized: SDCPN = {
      transitions: structuredClone(pre.transitions),
      places: structuredClone(pre.places),
      parameters: structuredClone(pre.parameters),
      differentialEquations: structuredClone(pre.differentialEquations),
      types: structuredClone(pre.types),
    };
    expect(canonicalContent(reserialized)).toBe(canonicalContent(pre));
    expect(observe(reserialized).sha256).not.toBe(unchanged.sha256);
    await expect(
      verify(
        {
          ...noOpRecord,
          post: { ...observe(reserialized), revisionId: "revision-1" },
        },
        noOpVerification,
      ),
    ).rejects.toThrow(/same raw observation/u);
    await expect(
      verify(
        {
          ...noOpRecord,
          post: { ...unchanged, revisionId: "revision-2" },
        },
        noOpVerification,
      ),
    ).rejects.toThrow(/same raw observation/u);

    const legacy = { attempts: [applied()], outcome: "applied" as const };
    expect(
      parseClientToolResultMetadata({
        mutationRecord: legacy,
        canonicalMutationRecord: canonicalRecord(),
      }),
    ).toMatchObject({ mutationRecord: legacy });
  });

  test("rejects mismatched identity, canonical input and canonical output", async () => {
    const record = canonicalRecord();
    await expect(verify(record, { toolName: "removeArc" })).rejects.toThrow(
      /issued call/u,
    );
    await expect(
      verify(record, {
        canonicalInput: { ...request.input, weight: 2 },
      }),
    ).rejects.toThrow(/input/u);
    await expect(
      verify(record, { canonicalOutput: { success: false } }),
    ).rejects.toThrow(/output/u);
    await expect(
      verify({
        ...record,
        binding: { ...record.binding, documentId: "other" },
      }),
    ).rejects.toThrow(/incarnation/u);
  });

  test("does not turn applied:false with a changed document into a no-op", async () => {
    const record = canonicalRecord();
    const terminalOutput = { applied: false, reason: "Not applied." };
    await expect(
      verify(
        {
          ...record,
          outcome: "no-op",
          settlement: { status: "not-required" },
          output: terminalOutput,
        },
        { canonicalOutput: terminalOutput },
      ),
    ).rejects.toThrow(/no-op outcome/u);
    await expect(
      verify(
        { ...record, output: terminalOutput },
        { canonicalOutput: terminalOutput },
      ),
    ).rejects.toThrow(/contradicts an applied outcome/u);
  });

  test("re-hashes observations, re-derives effects and refuses failed settlement as durable applied", async () => {
    const record = canonicalRecord();
    await expect(
      verify({ ...record, post: { ...record.post!, sha256: "0".repeat(64) } }),
    ).rejects.toThrow(/hash/u);
    await expect(
      verify({
        ...record,
        effects: { ...record.effects, created: [] },
      }),
    ).rejects.toThrow(/complete canonical diff/u);
    await expect(
      verify({
        ...record,
        settlement: {
          status: "failed",
          revisionId: "revision-2",
          error: "Persistence failed",
        },
      }),
    ).rejects.toThrow(/requires a settled/u);
  });
});

describe("deep construction sidecars", () => {
  const ledger = {
    revisionId: "deep-ledger",
    markdown: "Create a receiving queue.",
    sha256: createHash("sha256")
      .update("Create a receiving queue.")
      .digest("hex"),
    ordinal: 1,
  };
  const deepInput = {
    // eslint-disable-next-line oxc/no-map-spread -- Frozen fixtures differ by optional evidence.
    operations: ["one", "two", "three"].map((id, index) => ({
      operationId: id,
      toolName: "addPlace" as const,
      intendedEffect: `Create ${id}.`,
      intendedTarget: id,
      expectedImpact: [`place:${id}`],
      ...(index === 0
        ? {
            evidence: {
              excerpts: ["receiving queue"],
              rationale: "The settled Ledger names the queue.",
            },
          }
        : {}),
      input: {
        ...pre.places[0]!,
        id,
        name: `Place${index + 1}`,
        x: index * 20,
      },
    })),
  };
  const deepFixture = () => {
    let current: SDCPN = {
      places: [],
      transitions: [],
      types: [],
      parameters: [],
      differentialEquations: [],
    };
    const base = { ...observe(current), revisionId: "deep-base" };
    const attempts = deepInput.operations.map((operation, index) => {
      const preObservation = {
        ...observe(current),
        revisionId: index === 0 ? "deep-base" : `deep-post-${index}`,
      };
      const operationRequest: ConstructionMutationRequest = {
        toolCallId: "deep-call",
        toolName: operation.toolName,
        input: operation.input,
        binding: request.binding,
        requestedBaseHash: preObservation.sha256,
      };
      const next = expectedNodeDefinition(operationRequest, current);
      const post = { ...observe(next), revisionId: `deep-post-${index + 1}` };
      const effects = deriveMutationEffects(operationRequest, current, next);
      current = next;
      return {
        toolCallId: "deep-call",
        toolName: operation.toolName,
        binding: request.binding,
        input: operation.input,
        pre: preObservation,
        post,
        outcome: "applied" as const,
        effects,
        settlement: { status: "settled" as const, revisionId: post.revisionId },
        diagnostics: { status: "not-required" as const },
        output: { applied: true, target: operation.input.id },
      };
    });
    const output = {
      execution: "ordered-stop" as const,
      disposition: "complete" as const,
      outcomes: attempts.map((attempt, index) => ({
        index,
        operationId: deepInput.operations[index]!.operationId,
        toolName: "addPlace" as const,
        status: "applied" as const,
        effects: [
          ...attempt.effects.created,
          ...attempt.effects.updated,
          ...attempt.effects.deleted,
          ...attempt.effects.derived,
        ],
      })),
      finalObservation: {
        disposition: "observed" as const,
        documentRevision: "deep-post-3",
        definitionHash: observe(current).sha256,
      },
      diagnostics: { disposition: "not-required" as const },
      layout: {
        requested: false as const,
        disposition: "not-requested" as const,
      },
    };
    return {
      output,
      record: {
        toolCallId: "deep-call",
        binding: request.binding,
        input: deepInput,
        authority: {
          status: "verified" as const,
          base,
          ledger: {
            revisionId: ledger.revisionId,
            sha256: ledger.sha256,
            ordinal: ledger.ordinal,
          },
          bases: [
            {
              kind: "declared" as const,
              revisionId: ledger.revisionId,
              sha256: ledger.sha256,
              locators: [{ start: 9, end: 24 }],
              rationale: "The settled Ledger names the queue.",
              scope: "operation" as const,
            },
            {
              kind: "absent" as const,
              reason:
                "No exact Ledger excerpt was supplied for this operation.",
            },
            {
              kind: "absent" as const,
              reason:
                "No exact Ledger excerpt was supplied for this operation.",
            },
          ],
        },
        attempts,
        output,
      },
    };
  };
  const verifyDeep = (record: unknown, output: unknown) =>
    verifyDeepConstructionRecord({
      record,
      toolCallId: "deep-call",
      canonicalInput: deepInput,
      canonicalOutput: output,
      binding: request.binding,
      ledgerRevision: ledger,
    });

  test("verifies a complete ordered three-step record with frozen declared and absent bases", async () => {
    const fixture = deepFixture();
    await expect(
      verifyDeep(fixture.record, fixture.output),
    ).resolves.toMatchObject({
      attempts: [
        { basis: { kind: "declared" }, record: { outcome: "applied" } },
        { basis: { kind: "absent" } },
        { basis: { kind: "absent" } },
      ],
    });
  });

  test("verifies applied layout against host-owned observations, effects, hashes and settlement", async () => {
    const fixture = deepFixture();
    const preLayout = structuredClone(fixture.record.attempts.at(-1)!.post);
    const laidOut = structuredClone(preLayout.definition);
    laidOut.places[0]!.x = 240;
    laidOut.places[1]!.y = 120;
    const postLayout = { ...observe(laidOut), revisionId: "deep-layout-post" };
    const effects = deriveLayoutEffects(preLayout.definition, laidOut);
    const output = {
      ...fixture.output,
      finalObservation: {
        disposition: "observed" as const,
        documentRevision: postLayout.revisionId,
        definitionHash: postLayout.sha256,
      },
      layout: {
        requested: true as const,
        disposition: "applied" as const,
        preHash: preLayout.sha256,
        postHash: postLayout.sha256,
      },
    };
    const record = {
      ...fixture.record,
      input: { ...deepInput, layout: { requested: true as const } },
      layout: {
        pre: preLayout,
        post: postLayout,
        effects,
        settlement: {
          status: "settled" as const,
          revisionId: postLayout.revisionId,
        },
      },
      output,
    };
    const verifyLayout = (candidateRecord: unknown, candidateOutput: unknown) =>
      verifyDeepConstructionRecord({
        record: candidateRecord,
        toolCallId: "deep-call",
        canonicalInput: record.input,
        canonicalOutput: candidateOutput,
        binding: request.binding,
        ledgerRevision: ledger,
      });

    await expect(verifyLayout(record, output)).resolves.toMatchObject({
      layout: {
        pre: { sha256: preLayout.sha256 },
        post: { sha256: postLayout.sha256 },
        effects,
      },
      output: { finalObservation: { definitionHash: postLayout.sha256 } },
    });
    await expect(
      verifyLayout(
        {
          ...record,
          layout: {
            ...record.layout,
            settlement: {
              status: "failed",
              revisionId: postLayout.revisionId,
              error: "Persistence refused.",
            },
          },
        },
        output,
      ),
    ).rejects.toThrow(/settlement|failure/u);

    for (const tamper of [
      (candidate: typeof record, candidateOutput: typeof output) => {
        const mutableRecord = candidate;
        const mutableOutput = candidateOutput;
        mutableRecord.layout.pre = structuredClone(
          mutableRecord.authority.base,
        );
        mutableRecord.layout.pre.revisionId = "deep-base";
        mutableOutput.layout.preHash = mutableRecord.layout.pre.sha256;
        mutableRecord.output.layout.preHash = mutableRecord.layout.pre.sha256;
      },
      (candidate: typeof record, candidateOutput: typeof output) => {
        const mutableRecord = candidate;
        mutableRecord.layout.effects = [];
        void candidateOutput;
      },
      (candidate: typeof record, candidateOutput: typeof output) => {
        const mutableRecord = candidate;
        const mutableOutput = candidateOutput;
        mutableOutput.layout.postHash = "0".repeat(64);
        mutableRecord.output.layout.postHash = "0".repeat(64);
      },
      (candidate: typeof record, candidateOutput: typeof output) => {
        const mutableRecord = candidate;
        const mutableOutput = candidateOutput;
        mutableOutput.finalObservation.definitionHash = "0".repeat(64);
        mutableRecord.output.finalObservation.definitionHash = "0".repeat(64);
      },
    ]) {
      const candidate = structuredClone(record);
      const candidateOutput = structuredClone(output);
      tamper(candidate, candidateOutput);
      // eslint-disable-next-line no-await-in-loop -- Independent adversarial layout records.
      await expect(verifyLayout(candidate, candidateOutput)).rejects.toThrow(
        /.+/u,
      );
    }
  });

  test("verifies failed layout without state change and changed state only with recorded evidence", async () => {
    const fixture = deepFixture();
    const unchangedOutput = {
      ...fixture.output,
      layout: {
        requested: true as const,
        disposition: "failed" as const,
        error: "Layout failed before mutation.",
      },
    };
    const unchangedRecord = {
      ...fixture.record,
      input: { ...deepInput, layout: { requested: true as const } },
      output: unchangedOutput,
    };
    await expect(
      verifyDeepConstructionRecord({
        record: unchangedRecord,
        toolCallId: "deep-call",
        canonicalInput: unchangedRecord.input,
        canonicalOutput: unchangedOutput,
        binding: request.binding,
        ledgerRevision: ledger,
      }),
    ).resolves.not.toHaveProperty("layout");

    const preLayout = structuredClone(fixture.record.attempts.at(-1)!.post);
    const laidOut = structuredClone(preLayout.definition);
    laidOut.places[0]!.x = 80;
    const postLayout = {
      ...observe(laidOut),
      revisionId: "failed-layout-post",
    };
    const changedOutput = {
      ...unchangedOutput,
      finalObservation: {
        disposition: "observed" as const,
        documentRevision: postLayout.revisionId,
        definitionHash: postLayout.sha256,
      },
      layout: {
        ...unchangedOutput.layout,
        preHash: preLayout.sha256,
        postHash: postLayout.sha256,
      },
    };
    const changedRecord = {
      ...unchangedRecord,
      layout: {
        pre: preLayout,
        post: postLayout,
        effects: deriveLayoutEffects(preLayout.definition, laidOut),
        settlement: {
          status: "failed" as const,
          revisionId: postLayout.revisionId,
          error: changedOutput.layout.error,
        },
      },
      output: changedOutput,
    };
    const verifyChangedFailure = (
      candidateRecord: unknown,
      candidateOutput: unknown,
    ) =>
      verifyDeepConstructionRecord({
        record: candidateRecord,
        toolCallId: "deep-call",
        canonicalInput: changedRecord.input,
        canonicalOutput: candidateOutput,
        binding: request.binding,
        ledgerRevision: ledger,
      });
    await expect(
      verifyChangedFailure(changedRecord, changedOutput),
    ).resolves.toMatchObject({
      layout: {
        post: { sha256: postLayout.sha256 },
        settlement: {
          status: "failed",
          error: changedOutput.layout.error,
        },
      },
      output: { layout: { disposition: "failed" } },
    });

    for (const contradiction of [
      (
        candidate: typeof changedRecord,
        candidateOutput: typeof changedOutput,
      ) => {
        const mutableRecord = candidate;
        mutableRecord.layout.settlement.revisionId = "wrong-revision";
        void candidateOutput;
      },
      (
        candidate: typeof changedRecord,
        candidateOutput: typeof changedOutput,
      ) => {
        const mutableRecord = candidate;
        mutableRecord.layout.settlement.error = "Different failure.";
        void candidateOutput;
      },
      (
        candidate: typeof changedRecord,
        candidateOutput: typeof changedOutput,
      ) => {
        const mutableRecord = candidate;
        const mutableOutput = candidateOutput;
        mutableRecord.output.layout.postHash = "0".repeat(64);
        mutableOutput.layout.postHash = "0".repeat(64);
      },
    ]) {
      const candidate = structuredClone(changedRecord);
      const candidateOutput = structuredClone(changedOutput);
      contradiction(candidate, candidateOutput);
      // eslint-disable-next-line no-await-in-loop -- Independent failed-settlement contradictions.
      await expect(
        verifyChangedFailure(candidate, candidateOutput),
      ).rejects.toThrow(/.+/u);
    }
  });

  test("verifies a no-op prefix against the current base before later applied steps", async () => {
    const fixture = deepFixture();
    const first = fixture.record.attempts[0]!;
    const existing = structuredClone(first.post);
    const noOp = {
      ...first,
      pre: existing,
      post: existing,
      outcome: "no-op" as const,
      effects: { created: [], updated: [], deleted: [], derived: [] },
      settlement: { status: "not-required" as const },
      output: { applied: false, target: first.input.id },
    };
    fixture.record.authority.base = existing;
    fixture.record.attempts[0] = noOp as unknown as typeof first;
    const output = {
      ...fixture.output,
      outcomes: [
        {
          ...fixture.output.outcomes[0]!,
          status: "no-op" as const,
          effects: [],
        },
        ...fixture.output.outcomes.slice(1),
      ],
    };
    fixture.record.output = output as unknown as typeof fixture.record.output;
    const verified = await verifyDeep(fixture.record, output);
    expect(verified.attempts.map(({ record }) => record.outcome)).toEqual([
      "no-op",
      "applied",
      "applied",
    ]);
  });

  test("rejects stale authority, tampered steps, effects, final hashes and outer output", async () => {
    const cases = [
      (fixture: ReturnType<typeof deepFixture>) => {
        // eslint-disable-next-line no-param-reassign -- Adversarial fixture mutation.
        fixture.record.authority.ledger.sha256 = "0".repeat(64);
      },
      (fixture: ReturnType<typeof deepFixture>) => {
        // eslint-disable-next-line no-param-reassign -- Adversarial fixture mutation.
        fixture.record.attempts[0]!.input = {
          ...fixture.record.attempts[0]!.input,
          name: "tampered",
        };
      },
      (fixture: ReturnType<typeof deepFixture>) => {
        // eslint-disable-next-line no-param-reassign -- Adversarial fixture mutation.
        fixture.record.output.outcomes[0]!.effects = [];
        // eslint-disable-next-line no-param-reassign -- Keep delivered output equal while tampering effects.
        fixture.output.outcomes[0]!.effects = [];
      },
      (fixture: ReturnType<typeof deepFixture>) => {
        // eslint-disable-next-line no-param-reassign -- Adversarial fixture mutation.
        fixture.record.output.finalObservation.definitionHash = "0".repeat(64);
        // eslint-disable-next-line no-param-reassign -- Keep delivered output equal while tampering its hash.
        fixture.output.finalObservation.definitionHash = "0".repeat(64);
      },
    ];
    for (const tamper of cases) {
      const fixture = deepFixture();
      tamper(fixture);
      // eslint-disable-next-line no-await-in-loop -- Independent adversarial records.
      await expect(verifyDeep(fixture.record, fixture.output)).rejects.toThrow(
        /.+/u,
      );
    }
    const fixture = deepFixture();
    await expect(
      verifyDeep(fixture.record, {
        ...fixture.output,
        diagnostics: { disposition: "pending" },
      }),
    ).rejects.toThrow(/output/u);
  });

  test("verifies failed and unknown partial prefixes and leaves the suffix unattempted", async () => {
    for (const status of ["failed", "unknown"] as const) {
      const fixture = deepFixture();
      const appliedSecond = fixture.record.attempts[1]!;
      const second =
        status === "failed"
          ? {
              ...appliedSecond,
              post: structuredClone(appliedSecond.pre),
              outcome: "failed" as const,
              effects: { created: [], updated: [], deleted: [], derived: [] },
              settlement: { status: "not-required" as const },
              error: "Rejected.",
              output: { applied: false, error: "Rejected." },
            }
          : {
              ...appliedSecond,
              outcome: "unknown" as const,
              error: "Settlement standing is unknown.",
            };
      fixture.record.attempts[1] = second as unknown as typeof appliedSecond;
      const terminalObservation = second.post;
      const output = {
        ...fixture.output,
        disposition: "partial" as const,
        outcomes: [
          fixture.output.outcomes[0]!,
          {
            index: 1,
            operationId: "two",
            toolName: "addPlace" as const,
            status,
            error:
              status === "failed"
                ? "Rejected."
                : "Settlement standing is unknown.",
          },
          {
            index: 2,
            operationId: "three",
            toolName: "addPlace" as const,
            status: "unattempted" as const,
          },
        ],
        finalObservation: {
          disposition: "observed" as const,
          documentRevision: terminalObservation.revisionId!,
          definitionHash: terminalObservation.sha256,
        },
      };
      const record = {
        ...fixture.record,
        attempts: fixture.record.attempts.slice(0, 2),
        output,
      };
      // eslint-disable-next-line no-await-in-loop -- Both terminal standings cross the full verifier.
      await expect(verifyDeep(record, output)).resolves.toMatchObject({
        output: { disposition: "partial" },
        attempts: [{}, { record: { outcome: status } }],
      });
    }
  });

  test("accepts a refused result only with refused authority and zero attempts", async () => {
    const fixture = deepFixture();
    const output = {
      ...fixture.output,
      disposition: "refused" as const,
      reason: "Ledger unavailable.",
      outcomes: deepInput.operations.map((operation, index) => ({
        index,
        operationId: operation.operationId,
        toolName: operation.toolName,
        status: "unattempted" as const,
      })),
      finalObservation: {
        disposition: "observed" as const,
        documentRevision: "deep-base",
        definitionHash: fixture.record.authority.base.sha256,
      },
    };
    const record = {
      ...fixture.record,
      authority: {
        status: "refused" as const,
        reason: "Ledger unavailable.",
        base: fixture.record.authority.base,
      },
      attempts: [],
      output,
    };
    await expect(verifyDeep(record, output)).resolves.toMatchObject({
      authority: { status: "refused" },
      attempts: [],
    });
    await expect(
      verifyDeep({ ...record, attempts: [fixture.record.attempts[0]] }, output),
    ).rejects.toThrow(/zero attempts/u);
  });
});

describe("applyAutoLayout record semantics", () => {
  test("derives only position updates and records the actual moved coordinates", () => {
    const post = structuredClone(pre);
    post.places[0]!.x = 40;
    post.places[0]!.y = 60;
    post.transitions[0]!.y = 60;
    expect(deriveLayoutEffects(pre, post)).toEqual([
      { path: "/places/0/x", kind: "updated", before: 0, after: 40 },
      { path: "/places/0/y", kind: "updated", before: 0, after: 60 },
      { path: "/transitions/0/y", kind: "updated", before: 0, after: 60 },
    ]);
    expect(deriveLayoutEffects(pre, structuredClone(pre))).toEqual([]);
  });

  test("refuses to absorb a non-position change as layout", () => {
    const renamed = structuredClone(pre);
    renamed.places[0]!.x = 40;
    renamed.places[0]!.name = "Renamed";
    expect(() => deriveLayoutEffects(pre, renamed)).toThrow(
      "Layout changed more than positions: /places/0/name",
    );
    const removed = structuredClone(pre);
    removed.transitions = [];
    expect(() => deriveLayoutEffects(pre, removed)).toThrow(
      "Layout changed more than positions: /transitions/0",
    );
  });
});
