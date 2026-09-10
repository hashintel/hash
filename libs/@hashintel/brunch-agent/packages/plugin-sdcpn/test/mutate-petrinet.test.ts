import { describe, expect, test, vi } from "vitest";

import { mutatePetrinetInputSchema } from "../src/mutate-petrinet";
import { createMutatePetrinetTool } from "../src/tools/mutate-petrinet";

import type { DefinitionObservation } from "../src/mutation-record";
import type { SDCPN } from "@hashintel/petrinaut-core";

const hash = "a".repeat(64);
const currentRevision = {
  revisionId: "revision-1",
  ordinal: 1,
  markdown: "Queue work.",
  sha256: "b".repeat(64),
  sourceKind: "assistant" as const,
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
  test("admits only unique root operations with declared bases", () => {
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
          ],
        })
        .operations.map(({ type }) => type),
    ).toEqual(["addType", "addParameter", "addDifferentialEquation"]);
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
    expect(observation?.description).toMatch(/getLatestNetDefinition/u);
    expect(bases?.description).toMatch(/basisId/u);
    expect(operations?.description).toMatch(
      /\{operationId, basisId, type, input\}/u,
    );
    expect(property(bases, "items", root) ?? bases).toBeDefined();
    const variants = variantsOf(operations, root);
    expect(variants.length).toBe(9);
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
    const compactBytes = JSON.stringify(root).length;
    expect(compactBytes).toBeLessThan(64 * 1024);
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
