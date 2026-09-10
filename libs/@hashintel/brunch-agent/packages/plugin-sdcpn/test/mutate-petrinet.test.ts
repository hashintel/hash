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
      basisId: "queue-basis",
      operation: {
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
      },
    },
  ],
};

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
        operations: [
          firstOperation,
          {
            ...firstOperation,
            operation: {
              ...firstOperation.operation,
              input: {
                ...firstOperation.operation.input,
                targetSubnetId: "nested",
              },
            },
          },
        ],
      }),
    ).toThrow(/operationId must be unique|Only root mutations/u);
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
