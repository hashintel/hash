import { describe, expect, test, vi } from "vitest";
import { z } from "zod";

import { mutationActionInputSchemas } from "@hashintel/petrinaut-core";
import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import {
  applyPetrinautConstructionInputSchema,
  applyPetrinautConstructionOutputSchema,
  mutatePetrinetInputSchema,
} from "../src/mutate-petrinet";
import {
  applyPetrinautConstructionTool,
  createMutatePetrinetTool,
} from "../src/tools/mutate-petrinet";

import type { DefinitionObservation } from "../src/mutation-record";
import type { SDCPN } from "@hashintel/petrinaut-core";

const hash = "a".repeat(64);
const currentRevision = {
  revisionId: "revision-1",
  ordinal: 1,
  markdown: "Queue work.",
  sha256: "b".repeat(64),
  evidence: [],
};
const emptyDefinition: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};
const input = {
  observation: { toolCallId: "read-1", baseHash: hash },
  bases: [
    {
      basisId: "queue-basis",
      basis: {
        kind: "declared" as const,
        revisionId: currentRevision.revisionId,
        sha256: currentRevision.sha256,
        locators: [{ start: 0, end: 5 }],
        rationale: "The account names a queue.",
        scope: "operation" as const,
      },
    },
  ],
  operations: [
    {
      operationId: "add-queue",
      basisId: "queue-basis",
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
    },
  ],
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const resolveRef = (
  schema: Record<string, unknown>,
  root: Record<string, unknown>,
): Record<string, unknown> => {
  const ref = schema.$ref;
  if (typeof ref !== "string" || !ref.startsWith("#/")) return schema;
  let current: unknown = root;
  for (const segment of ref.slice(2).split("/")) {
    current = asRecord(current)?.[segment];
  }
  return asRecord(current) ?? schema;
};

const property = (
  schema: unknown,
  name: string,
  root: Record<string, unknown>,
): Record<string, unknown> | undefined => {
  const record = asRecord(schema);
  if (!record) return undefined;
  const resolved = resolveRef(record, root);
  const properties = asRecord(resolved.properties);
  const found = asRecord(properties?.[name]);
  return found === undefined ? undefined : resolveRef(found, root);
};

const variantsOf = (
  schema: unknown,
  root: Record<string, unknown>,
): Record<string, unknown>[] => {
  const record = asRecord(schema);
  if (!record) return [];
  const resolved = resolveRef(record, root);
  const choices = resolved.oneOf ?? resolved.anyOf;
  if (Array.isArray(choices))
    return choices.flatMap((choice) => variantsOf(choice, root));
  if (resolved.items !== undefined) return variantsOf(resolved.items, root);
  return [resolved];
};

const requiredOf = (schema: Record<string, unknown>): string[] =>
  Array.isArray(schema.required)
    ? schema.required.filter((name): name is string => typeof name === "string")
    : [];

describe("mutate_petrinet tool", () => {
  test("admits the provisional 30-operation boundary and refuses 31", () => {
    const firstOperation = input.operations[0];
    if (!firstOperation) throw new Error("Missing test operation");
    const operations = Array.from({ length: 31 }, (_, index) => ({
      ...firstOperation,
      operationId: `add-queue-${index}`,
      input: { ...firstOperation.input, id: `queue-${index}` },
    }));

    expect(
      mutatePetrinetInputSchema.parse({
        ...input,
        operations: operations.slice(0, 30),
      }).operations,
    ).toHaveLength(30);
    expect(() =>
      mutatePetrinetInputSchema.parse({ ...input, operations }),
    ).toThrow(/30|too big|maximum/iu);
  });

  test("accepts the typed fixture and admits only unique root operations with declared bases", () => {
    const firstOperation = input.operations[0];
    if (!firstOperation) throw new Error("Missing test operation");
    expect(mutatePetrinetInputSchema.parse(input)).toEqual(input);
    expect(() =>
      mutatePetrinetInputSchema.parse({
        ...input,
        operations: [
          ...input.operations,
          { ...firstOperation, basisId: "missing" },
        ],
      }),
    ).toThrow(/basisId must name/u);
    expect(() =>
      mutatePetrinetInputSchema.parse({
        ...input,
        operations: [firstOperation, firstOperation],
      }),
    ).toThrow(/operationId must be unique/u);
    expect(() =>
      mutatePetrinetInputSchema.parse({
        ...input,
        operations: [
          {
            ...firstOperation,
            input: { ...firstOperation.input, targetSubnetId: "nested" },
          },
        ],
      }),
    ).toThrow(/unrecognized|targetSubnetId/iu);
    expect(() =>
      mutatePetrinetInputSchema.parse({
        ...input,
        operations: [
          {
            ...firstOperation,
            input: { ...firstOperation.input, targetSubnetId: null },
          },
        ],
      }),
    ).toThrow(/unrecognized|targetSubnetId/iu);
    expect(
      mutatePetrinetInputSchema
        .parse({
          ...input,
          operations: [
            {
              operationId: "remove-queue",
              basisId: "queue-basis",
              type: "removePlace",
              input: { placeId: "queue" },
            },
            {
              operationId: "remove-start",
              basisId: "queue-basis",
              type: "removeTransition",
              input: { transitionId: "start" },
            },
            {
              operationId: "unwire-queue",
              basisId: "queue-basis",
              type: "removeArc",
              input: {
                transitionId: "start",
                arcDirection: "input",
                placeId: "queue",
              },
            },
          ],
        })
        .operations.map(({ type }) => type),
    ).toEqual(["removePlace", "removeTransition", "removeArc"]);
    expect(
      mutatePetrinetInputSchema
        .parse({
          ...input,
          operations: [
            {
              operationId: "add-item",
              basisId: "queue-basis",
              type: "addType",
              input: {
                id: "item",
                name: "Item",
                iconSlug: "circle",
                displayColor: "#1E90FF",
                elements: [],
              },
            },
            {
              operationId: "add-rate",
              basisId: "queue-basis",
              type: "addParameter",
              input: {
                id: "rate",
                name: "Rate",
                variableName: "arrival_rate",
                type: "real",
                defaultValue: "1",
              },
            },
            {
              operationId: "add-decay",
              basisId: "queue-basis",
              type: "addDifferentialEquation",
              input: {
                id: "decay",
                name: "Decay",
                colorId: "item",
                code: "return tokens.map(() => ({}));",
              },
            },
            {
              operationId: "repair-decay",
              basisId: "queue-basis",
              type: "updateDifferentialEquation",
              input: {
                equationId: "decay",
                update: { code: "return tokens.map(() => ({}));" },
              },
            },
          ],
        })
        .operations.map(({ type }) => type),
    ).toEqual([
      "addType",
      "addParameter",
      "addDifferentialEquation",
      "updateDifferentialEquation",
    ]);
  });

  test("admits edits to existing parts by ID, but not canvas positions or subnet targets", () => {
    const edits = [
      {
        operationId: "rename-queue",
        basisId: "queue-basis",
        type: "updatePlace",
        input: { placeId: "queue", update: { name: "Backlog" } },
      },
      {
        operationId: "start-rate",
        basisId: "queue-basis",
        type: "updateTransition",
        input: {
          transitionId: "start",
          update: { lambdaType: "stochastic", lambdaCode: "return 2;" },
        },
      },
      {
        operationId: "double-weight",
        basisId: "queue-basis",
        type: "updateArcWeight",
        input: {
          transitionId: "start",
          arcDirection: "input",
          placeId: "queue",
          weight: 2,
        },
      },
      {
        operationId: "read-only",
        basisId: "queue-basis",
        type: "updateArcType",
        input: { transitionId: "start", placeId: "queue", type: "read" },
      },
      {
        operationId: "rename-item",
        basisId: "queue-basis",
        type: "updateType",
        input: { typeId: "item", update: { name: "Lot" } },
      },
      {
        operationId: "add-age",
        basisId: "queue-basis",
        type: "addTypeElement",
        input: {
          typeId: "item",
          element: { elementId: "age", name: "age", type: "real" },
        },
      },
      {
        operationId: "rename-age",
        basisId: "queue-basis",
        type: "updateTypeElement",
        input: {
          typeId: "item",
          elementId: "age",
          update: { name: "age_days" },
        },
      },
      {
        operationId: "rename-rate",
        basisId: "queue-basis",
        type: "updateParameter",
        input: {
          parameterId: "rate",
          update: { variableName: "daily_demand", defaultValue: "12" },
        },
      },
      {
        operationId: "drop-age",
        basisId: "queue-basis",
        type: "removeTypeElement",
        input: { typeId: "item", elementId: "age" },
      },
      {
        operationId: "drop-rate",
        basisId: "queue-basis",
        type: "removeParameter",
        input: { parameterId: "rate" },
      },
      {
        operationId: "drop-decay",
        basisId: "queue-basis",
        type: "removeDifferentialEquation",
        input: { equationId: "decay" },
      },
      {
        operationId: "drop-item",
        basisId: "queue-basis",
        type: "removeType",
        input: { typeId: "item" },
      },
      // Saved scenarios and metrics: a count that an experiment may vary is
      // an integer scenario parameter; the objective is a saved metric.
      {
        operationId: "add-peak",
        basisId: "queue-basis",
        type: "addScenario",
        input: {
          id: "peak-demand",
          name: "Peak demand",
          scenarioParameters: [
            { identifier: "active_agents", type: "integer", default: 4 },
          ],
          initialState: {
            type: "per_place",
            content: { queue: "scenario.active_agents" },
          },
        },
      },
      {
        operationId: "describe-peak",
        basisId: "queue-basis",
        type: "updateScenario",
        input: {
          scenarioId: "peak-demand",
          update: { description: "Monday morning arrivals" },
        },
      },
      {
        operationId: "add-wait",
        basisId: "queue-basis",
        type: "addMetric",
        input: {
          id: "average-wait",
          name: "Average wait",
          code: "return state.places.Queue.count;",
        },
      },
      {
        operationId: "rename-wait",
        basisId: "queue-basis",
        type: "updateMetric",
        input: {
          metricId: "average-wait",
          update: { name: "Average waiting time" },
        },
      },
      {
        operationId: "drop-wait",
        basisId: "queue-basis",
        type: "removeMetric",
        input: { metricId: "average-wait" },
      },
      {
        operationId: "drop-peak",
        basisId: "queue-basis",
        type: "removeScenario",
        input: { scenarioId: "peak-demand" },
      },
    ];
    expect(
      mutatePetrinetInputSchema
        .parse({ ...input, operations: edits })
        .operations.map(({ type }) => type),
    ).toEqual(edits.map(({ type }) => type));
    // Scenario parameters keep the canonical primitive types; a count is not
    // widened past `integer`, and an unknown identity field is refused.
    expect(
      mutatePetrinetInputSchema.safeParse({
        ...input,
        operations: [
          {
            operationId: "bad-type",
            basisId: "queue-basis",
            type: "addScenario",
            input: {
              id: "bad",
              name: "Bad",
              scenarioParameters: [
                { identifier: "active_agents", type: "count", default: 4 },
              ],
              initialState: { type: "per_place", content: {} },
            },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      mutatePetrinetInputSchema.safeParse({
        ...input,
        operations: [
          {
            operationId: "bad-key",
            basisId: "queue-basis",
            type: "removeMetric",
            input: { scenarioId: "average-wait" },
          },
        ],
      }).success,
    ).toBe(false);
    // An unadmitted operation is refused at its own position with the admitted
    // list spelled out, so the model sees which operation was unsupported and
    // what it may send instead. Nothing is applied.
    for (const type of [
      "updatePlacePosition",
      "updateTransitionPosition",
      "addSubnet",
      "moveTypeElement",
    ]) {
      const refused = mutatePetrinetInputSchema.safeParse({
        ...input,
        operations: [
          input.operations[0],
          {
            operationId: "unsupported",
            basisId: "queue-basis",
            type,
            input: {},
          },
        ],
      });
      expect(refused.success).toBe(false);
      const issue = refused.error?.issues[0];
      expect(issue?.path).toEqual(["operations", 1, "type"]);
      expect(issue?.message).toMatch(/Invalid discriminator value/u);
      expect(issue?.message).toContain("'updateParameter'");
      expect(issue?.message).toContain("'removeType'");
      expect(issue?.message).not.toContain(`'${type}'`);
    }
    expect(() =>
      mutatePetrinetInputSchema.parse({
        ...input,
        operations: [
          {
            operationId: "nested",
            basisId: "queue-basis",
            type: "updatePlace",
            input: {
              placeId: "queue",
              update: { name: "Backlog" },
              targetSubnetId: "nested",
            },
          },
        ],
      }),
    ).toThrow(/unrecognized|targetSubnetId/iu);
  });

  test("refuses the wrapped operation dialect and addArc endpoint shorthand", () => {
    const firstOperation = input.operations[0];
    if (!firstOperation) throw new Error("Missing test operation");
    expect(() =>
      mutatePetrinetInputSchema.parse({
        ...input,
        operations: [
          {
            basisId: firstOperation.basisId,
            operation: {
              operationId: firstOperation.operationId,
              type: firstOperation.type,
              input: firstOperation.input,
            },
          },
        ],
      }),
    ).toThrow(/type|operationId|required/iu);
    expect(() =>
      mutatePetrinetInputSchema.parse({
        ...input,
        operations: [
          {
            operationId: "wire-queue",
            basisId: "queue-basis",
            type: "addArc",
            input: {
              transitionId: "start",
              arcDirection: "input",
              endpoint: { kind: "place", placeId: "queue" },
              weight: 1,
              type: "standard",
            },
          },
        ],
      }),
    ).toThrow(/placeId|endpoint|required/iu);
    expect(() =>
      mutatePetrinetInputSchema.parse({
        ...input,
        operations: [
          {
            operationId: "wire-queue",
            basisId: "queue-basis",
            type: "addArc",
            input: {
              transitionId: "start",
              arcDirection: "input",
              weight: 1,
              type: "standard",
            },
          },
        ],
      }),
    ).toThrow(/placeId/iu);
  });

  test("dumps a flat described envelope without subnet or endpoint fields", () => {
    const root = mutatePetrinetInputSchema.toJSONSchema({
      io: "input",
    }) as Record<string, unknown>;
    const observation = property(root, "observation", root);
    const bases = property(root, "bases", root);
    const operations = property(root, "operations", root);
    expect(observation?.description).toMatch(/read_petrinaut_net/u);
    expect(bases?.description).toMatch(/basisId/u);
    expect(operations?.description).toMatch(
      /\{operationId, basisId, type, input\}/u,
    );
    expect(property(bases, "items", root) ?? bases).toBeDefined();
    const variants = variantsOf(operations, root);
    expect(variants.length).toBe(28);
    for (const variant of variants) {
      expect(requiredOf(variant).sort()).toEqual(
        ["basisId", "input", "operationId", "type"].sort(),
      );
      expect(property(variant, "operationId", root)?.description).toMatch(
        /Unique identity/u,
      );
      expect(property(variant, "basisId", root)?.description).toMatch(/bases/u);
      const inputSchema = property(variant, "input", root);
      expect(property(inputSchema, "targetSubnetId", root)).toBeUndefined();
      expect(asRecord(inputSchema?.properties)?.targetSubnetId).toBeUndefined();
      const operationType = property(variant, "type", root)?.const;
      if (typeof operationType !== "string")
        throw new Error("Missing operation type");
      const canonical = Object.entries(mutationActionInputSchemas).find(
        ([name]) => name === operationType,
      )?.[1];
      if (!canonical)
        throw new Error(`Missing canonical operation ${operationType}`);
      // Preserve canonical summaries except where the selected surface supplies
      // narrower arc/parameter/transition guidance.
      if (
        [
          "addArc",
          "removeArc",
          "updateArcWeight",
          "updateArcType",
          "addParameter",
          "updateTransition",
        ].includes(operationType)
      )
        continue;
      expect(inputSchema?.description).toBe(canonical.description);
    }
    const addArc = variants.find((variant) => {
      const type = property(variant, "type", root);
      return type?.const === "addArc";
    });
    expect(addArc).toBeDefined();
    const addArcInput = property(addArc, "input", root);
    expect(addArcInput).toBeDefined();
    if (!addArcInput) throw new Error("Missing addArc input schema");
    expect(requiredOf(addArcInput)).toContain("placeId");
    expect(property(addArcInput, "endpoint", root)).toBeUndefined();
    expect(asRecord(addArcInput.properties)?.endpoint).toBeUndefined();
    expect(property(addArcInput, "placeId", root)?.description).toMatch(
      /root net/u,
    );
    const removeArc = variants.find((variant) => {
      const type = property(variant, "type", root);
      return type?.const === "removeArc";
    });
    expect(removeArc).toBeDefined();
    const removeArcInput = property(removeArc, "input", root);
    expect(removeArcInput).toBeDefined();
    if (!removeArcInput) throw new Error("Missing removeArc input schema");
    expect(requiredOf(removeArcInput)).toContain("placeId");
    expect(property(removeArcInput, "endpoint", root)).toBeUndefined();
    expect(asRecord(removeArcInput.properties)?.endpoint).toBeUndefined();
    for (const name of ["updateArcWeight", "updateArcType"]) {
      const variant = variants.find(
        (candidate) => property(candidate, "type", root)?.const === name,
      );
      const arcInput = property(variant, "input", root);
      if (!arcInput) throw new Error(`Missing ${name} input schema`);
      expect(requiredOf(arcInput)).toContain("placeId");
      expect(asRecord(arcInput.properties)?.endpoint).toBeUndefined();
    }
  });

  test("validates the workpiece and exact prior observation before deferring", async () => {
    const observationFor = vi.fn<
      (id: string) => Promise<DefinitionObservation>
    >(async () => ({
      definition: emptyDefinition,
      sha256: hash,
    }));
    const tool = createMutatePetrinetTool({
      currentRevision,
      retainedRevisionFor: async () => undefined,
      observationFor,
    });

    await expect(tool.run({ data: input } as never)).resolves.toMatchObject({
      output: { awaiting: "client" },
      terminate: true,
    });
    expect(observationFor).toHaveBeenCalledWith("read-1");

    const stale = createMutatePetrinetTool({
      currentRevision,
      retainedRevisionFor: async () => undefined,
      observationFor: async () => ({
        definition: emptyDefinition,
        sha256: "c".repeat(64),
      }),
    });
    await expect(stale.run({ data: input } as never)).rejects.toThrow(
      /differs from the verified browser observation/u,
    );
  });
});

const constructionOperation = {
  operationId: "add-queue",
  toolName: "addPlace" as const,
  input: input.operations[0]!.input,
  intendedEffect: "Represent waiting work.",
  intendedTarget: "Queue",
  expectedImpact: ["place:queue"],
  evidence: {
    excerpts: ["Queue work."],
    rationale: "The Ledger names queue work.",
  },
};

const collectPropertyNames = (value: unknown, names = new Set<string>()) => {
  if (Array.isArray(value)) {
    for (const item of value) collectPropertyNames(item, names);
  } else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (key === "properties" && typeof child === "object" && child !== null)
        for (const propertyName of Object.keys(
          child as Record<string, unknown>,
        ))
          names.add(propertyName);
      collectPropertyNames(child, names);
    }
  }
  return names;
};

describe("apply_petrinaut_construction tool", () => {
  test("enforces the bounded dependency-ordered intent contract", () => {
    const transition = {
      ...constructionOperation,
      operationId: "add-start",
      toolName: "addTransition" as const,
      input: {
        id: "start",
        name: "Start",
        description: "Start work",
        lambdaType: "stochastic" as const,
        lambdaCode: "return 1;",
        inputArcs: [],
        outputArcs: [],
        transitionKernelCode: "return {};",
        x: 0,
        y: 0,
      },
      expectedImpact: ["transition:start"],
    };
    const arc = {
      ...constructionOperation,
      operationId: "wire-start",
      toolName: "addArc" as const,
      input: {
        transitionId: "start",
        arcDirection: "input" as const,
        endpoint: { kind: "place" as const, placeId: "queue" },
        weight: 1,
        type: "standard" as const,
      },
      expectedImpact: ["arc:queue-start"],
      evidence: undefined,
    };
    const construction = {
      operations: [constructionOperation, transition, arc],
      layout: { requested: true as const },
    };
    expect(applyPetrinautConstructionInputSchema.parse(construction)).toEqual(
      construction,
    );
    expect(() =>
      applyPetrinautConstructionInputSchema.parse({
        operations: [...construction.operations, arc],
      }),
    ).toThrow(/3|too big|maximum/iu);
    expect(() =>
      applyPetrinautConstructionInputSchema.parse({
        operations: [transition, constructionOperation],
      }),
    ).toThrow(/ordered addPlace/iu);
    expect(() =>
      applyPetrinautConstructionInputSchema.parse({
        operations: [constructionOperation, constructionOperation],
      }),
    ).toThrow(/operationId must be unique/u);
    for (const changed of [
      { expectedImpact: ["same", "same"] },
      {
        evidence: {
          excerpts: ["same", "same"],
          rationale: "Repeated.",
        },
      },
    ])
      expect(() =>
        applyPetrinautConstructionInputSchema.parse({
          operations: [{ ...constructionOperation, ...changed }],
        }),
      ).toThrow(/must be distinct/iu);
  });

  test("embeds exact canonical schemas without model-authored protocol fields", () => {
    const root = applyPetrinautConstructionInputSchema.toJSONSchema({
      io: "input",
    }) as Record<string, unknown>;
    const variants = variantsOf(property(root, "operations", root), root);
    expect(variants).toHaveLength(3);
    for (const toolName of ["addPlace", "addTransition", "addArc"] as const) {
      const variant = variants.find(
        (candidate) =>
          property(candidate, "toolName", root)?.const === toolName,
      );
      const canonicalRoot = z
        .strictObject({ input: petrinautAiTools[toolName].inputSchema })
        .toJSONSchema({ io: "input" }) as Record<string, unknown>;
      expect(property(variant, "input", root)).toEqual(
        property(canonicalRoot, "input", canonicalRoot),
      );
    }
    const forbidden = new Set([
      "baseHash",
      "basisId",
      "binding",
      "documentHash",
      "documentRevision",
      "locator",
      "locators",
      "observationId",
      "observationToolCallId",
      "revisionId",
      "sha256",
      "toolCallId",
      "workpieceHash",
    ]);
    expect(
      [...collectPropertyNames(root)].filter((name) => forbidden.has(name)),
    ).toEqual([]);
  });

  test("describes complete, partial, unknown and pre-mutation refused results", () => {
    const applied = {
      index: 0,
      operationId: "add-queue",
      toolName: "addPlace" as const,
      status: "applied" as const,
      effects: [
        {
          kind: "derived" as const,
          path: "/places/queue/hidden-derived-state",
          before: null,
          after: { retained: true },
        },
      ],
    };
    const observed = {
      disposition: "observed" as const,
      documentRevision: "document-revision-2",
      definitionHash: "d".repeat(64),
    };
    const common = {
      execution: "ordered-stop" as const,
      finalObservation: observed,
      diagnostics: { disposition: "settled" as const, diagnostics: [] },
      layout: {
        requested: true as const,
        disposition: "not-relevant" as const,
      },
    };
    const partial = {
      ...common,
      disposition: "partial" as const,
      outcomes: [
        applied,
        {
          index: 1,
          operationId: "add-start",
          toolName: "addTransition" as const,
          status: "unknown" as const,
          error: "Live state changed but persistence could not be verified.",
        },
        {
          index: 2,
          operationId: "wire-start",
          toolName: "addArc" as const,
          status: "unattempted" as const,
        },
      ],
    };
    expect(applyPetrinautConstructionOutputSchema.parse(partial)).toEqual(
      partial,
    );
    const complete = {
      ...common,
      disposition: "complete" as const,
      outcomes: [applied],
      diagnostics: { disposition: "pending" as const },
      layout: { requested: true as const, disposition: "declined" as const },
    };
    expect(applyPetrinautConstructionOutputSchema.parse(complete)).toEqual(
      complete,
    );
    expect(
      applyPetrinautConstructionOutputSchema.parse({
        ...complete,
        layout: { requested: true, disposition: "confirmation-required" },
      }),
    ).toMatchObject({
      layout: { requested: true, disposition: "confirmation-required" },
    });

    const refused = {
      execution: "ordered-stop" as const,
      disposition: "refused" as const,
      reason: "Immutable browser binding did not verify.",
      outcomes: [
        {
          index: 0,
          operationId: "add-queue",
          toolName: "addPlace" as const,
          status: "unattempted" as const,
        },
      ],
      finalObservation: {
        disposition: "unavailable" as const,
        reason: "Immutable browser binding did not verify.",
      },
      diagnostics: { disposition: "not-required" as const },
      layout: {
        requested: false as const,
        disposition: "not-requested" as const,
      },
    };
    expect(applyPetrinautConstructionOutputSchema.parse(refused)).toEqual(
      refused,
    );
    expect(
      applyPetrinautConstructionOutputSchema.parse({
        ...refused,
        finalObservation: observed,
      }),
    ).toMatchObject({
      disposition: "refused",
      reason: "Immutable browser binding did not verify.",
      finalObservation: { disposition: "observed" },
    });
    for (const invalid of [
      { ...partial, disposition: "complete" },
      { ...partial, disposition: "refused" },
      { ...refused, reason: undefined },
      { ...complete, reason: "Not permitted on complete results." },
      {
        ...partial,
        finalObservation: {
          disposition: "unavailable",
          reason: "Missing observation.",
        },
      },
    ])
      expect(() =>
        applyPetrinautConstructionOutputSchema.parse(invalid),
      ).toThrow(/Disposition|final observation|reason/iu);
  });

  test("defers execution to the client", () => {
    expect(
      applyPetrinautConstructionTool.run({
        data: { operations: [constructionOperation] },
      } as never),
    ).toEqual({ output: { awaiting: "client" }, terminate: true });
  });
});
