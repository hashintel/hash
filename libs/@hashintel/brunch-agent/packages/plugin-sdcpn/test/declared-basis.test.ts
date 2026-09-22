import { createHash } from "node:crypto";

import { describe, expect, test } from "vitest";

import {
  createDeclarePetrinautProjectionTool,
  declaredProjectionInputSchema,
  validateDeclaredBasis,
  verifyDeclaredProjectionOutput,
} from "../src/declared-basis";

import type { WorkpieceRevision } from "@hashintel/brunch-agent/workpiece";

const markdown = "# Settled account\n\nReserve the shared resource.\n";
const current: WorkpieceRevision = {
  revisionId: "settled-call",
  sha256: createHash("sha256").update(markdown).digest("hex"),
  markdown,
  ordinal: 2,
};
const older = { ...current, revisionId: "older-call", ordinal: 1 };
const basis = {
  kind: "declared" as const,
  revisionId: current.revisionId,
  sha256: current.sha256,
  locators: [{ start: markdown.indexOf("Reserve"), end: markdown.length - 1 }],
  rationale: "Settled testimony about the reservation.",
  scope: "operation" as const,
};

const projection = {
  operations: [
    {
      operationId: "place-shared-resource",
      toolName: "addPlace" as const,
      intendedEffect: "Represent the shared resource as an available place.",
      intendedTarget: "Shared resource availability",
      expectedImpact: ["place: shared resource availability"],
      evidence: {
        excerpts: ["Reserve the shared resource."],
        rationale: "The passage identifies the resource reservation semantics.",
      },
    },
  ],
};

const runDeclaration = (revision: WorkpieceRevision | null, input: unknown) =>
  createDeclarePetrinautProjectionTool(revision).run({
    data: input,
  } as never);

describe("declared projection", () => {
  test("keeps authority protocol out of model input", () => {
    const modelSchema = JSON.stringify(
      declaredProjectionInputSchema.toJSONSchema({ io: "input" }),
    );
    expect(modelSchema).not.toMatch(/hash|revision|locator|observation/iu);
  });

  test("resolves exact unique current excerpts and returns intent only", () => {
    expect(runDeclaration(current, projection)).toEqual({
      output: {
        standing: "intent-only",
        revision: {
          revisionId: current.revisionId,
          sha256: current.sha256,
          ordinal: current.ordinal,
        },
        operations: [
          {
            operationId: "place-shared-resource",
            toolName: "addPlace",
            intendedEffect:
              "Represent the shared resource as an available place.",
            intendedTarget: "Shared resource availability",
            expectedImpact: ["place: shared resource availability"],
            basis: {
              kind: "declared",
              revisionId: current.revisionId,
              sha256: current.sha256,
              locators: [
                {
                  start: markdown.indexOf("Reserve"),
                  end: markdown.length - 1,
                },
              ],
              rationale:
                "The passage identifies the resource reservation semantics.",
              scope: "operation",
            },
          },
        ],
      },
      terminate: false,
    });
    expect(runDeclaration(current, projection)).not.toHaveProperty(
      "output.effects",
    );
  });

  test("recomputes a recorded result from issued semantics and host state", async () => {
    const recordedOutput = (await runDeclaration(current, projection)).output;
    expect(
      verifyDeclaredProjectionOutput({
        issuedInput: projection,
        recordedOutput,
        currentRevision: current,
      }),
    ).toEqual(recordedOutput);
    expect(() =>
      verifyDeclaredProjectionOutput({
        issuedInput: projection,
        recordedOutput: {
          ...recordedOutput,
          operations: [
            {
              ...recordedOutput.operations[0]!,
              expectedImpact: ["model-authored replacement"],
            },
          ],
        },
        currentRevision: current,
      }),
    ).toThrow(/does not match/iu);
  });

  test("requires a current settled revision and permits intent without an excerpt", () => {
    expect(() => runDeclaration(null, projection)).toThrow(
      /current Ledger revision/iu,
    );

    const unsupportedOperation = {
      ...projection.operations[0]!,
      evidence: undefined,
    };
    expect(
      runDeclaration(current, { operations: [unsupportedOperation] }),
    ).toMatchObject({
      output: {
        standing: "intent-only",
        operations: [
          {
            basis: {
              kind: "absent",
              reason:
                "No Ledger excerpt was declared for this intended operation.",
            },
          },
        ],
      },
    });
  });

  test("refuses missing, ambiguous, and stale excerpts", () => {
    expect(() =>
      runDeclaration(current, {
        operations: [
          {
            ...projection.operations[0],
            evidence: {
              ...projection.operations[0]!.evidence,
              excerpts: ["not present"],
            },
          },
        ],
      }),
    ).toThrow(/missing.*current/iu);

    const repeatedMarkdown = "Reserve this. Reserve this.";
    const repeated: WorkpieceRevision = {
      ...current,
      markdown: repeatedMarkdown,
      sha256: createHash("sha256").update(repeatedMarkdown).digest("hex"),
    };
    expect(() =>
      runDeclaration(repeated, {
        operations: [
          {
            ...projection.operations[0],
            evidence: {
              ...projection.operations[0]!.evidence,
              excerpts: ["Reserve this."],
            },
          },
        ],
      }),
    ).toThrow(/ambiguous/iu);

    const staleMarkdown = "# Settled account\n\nAn earlier intention.\n";
    const stale: WorkpieceRevision = {
      ...older,
      markdown: staleMarkdown,
      sha256: createHash("sha256").update(staleMarkdown).digest("hex"),
    };
    expect(() => runDeclaration(stale, projection)).toThrow(
      /missing.*current/iu,
    );
  });

  test("requires bounded expected impact", () => {
    const withoutExpectedImpact = {
      operationId: projection.operations[0]!.operationId,
      toolName: projection.operations[0]!.toolName,
      intendedEffect: projection.operations[0]!.intendedEffect,
      intendedTarget: projection.operations[0]!.intendedTarget,
      evidence: projection.operations[0]!.evidence,
    };
    expect(() =>
      declaredProjectionInputSchema.parse({
        operations: [withoutExpectedImpact],
      }),
    ).toThrow(/expectedImpact/iu);
    expect(() =>
      declaredProjectionInputSchema.parse({
        operations: [
          {
            ...projection.operations[0],
            expectedImpact: Array.from(
              { length: 9 },
              (_, index) => `definition-${index}`,
            ),
          },
        ],
      }),
    ).toThrow(/too big/iu);
    expect(() =>
      declaredProjectionInputSchema.parse({
        operations: [
          {
            ...projection.operations[0],
            expectedImpact: ["same definition", "same definition"],
          },
        ],
      }),
    ).toThrow(/distinct/iu);
  });

  test("requires unique operation IDs and allowed canonical tracer tools", () => {
    expect(() =>
      declaredProjectionInputSchema.parse({
        operations: [projection.operations[0], projection.operations[0]],
      }),
    ).toThrow(/operationId must be unique/iu);
    expect(() =>
      declaredProjectionInputSchema.parse({
        operations: [{ ...projection.operations[0], toolName: "updatePlace" }],
      }),
    ).toThrow(/Invalid option/iu);
    expect(() =>
      declaredProjectionInputSchema.parse({
        operations: Array.from({ length: 4 }, (_, index) => ({
          ...projection.operations[0],
          operationId: `operation-${index}`,
        })),
      }),
    ).toThrow(/too big/iu);
  });

  test("enforces nondecreasing canonical dependency order while allowing subsets", () => {
    const operation = projection.operations[0]!;
    expect(
      declaredProjectionInputSchema.parse({
        operations: [
          {
            ...operation,
            operationId: "transition-only",
            toolName: "addTransition",
          },
          { ...operation, operationId: "arc-after", toolName: "addArc" },
        ],
      }),
    ).toMatchObject({
      operations: [{ toolName: "addTransition" }, { toolName: "addArc" }],
    });
    expect(() =>
      declaredProjectionInputSchema.parse({
        operations: [
          { ...operation, operationId: "arc-first", toolName: "addArc" },
          {
            ...operation,
            operationId: "place-too-late",
            toolName: "addPlace",
          },
        ],
      }),
    ).toThrow(/ordered addPlace.*addTransition.*addArc/iu);
  });
});

describe("settled root arc basis", () => {
  test("accepts a basis citing the settled revision", async () => {
    await expect(
      validateDeclaredBasis(basis, current, async () => undefined),
    ).resolves.toEqual(basis);
  });
  test("refuses a citation of an unknown revisionId", async () => {
    await expect(
      validateDeclaredBasis(
        { ...basis, revisionId: "unknown" },
        current,
        async () => undefined,
      ),
    ).rejects.toThrow(/unknown/iu);
  });
  test("refuses a superseded revision unless supersession is intended", async () => {
    const citation = { ...basis, revisionId: older.revisionId };
    await expect(
      validateDeclaredBasis(citation, current, async () => older),
    ).rejects.toThrow(/superseded/iu);
    await expect(
      validateDeclaredBasis(
        { ...citation, supersessionIntended: true },
        current,
        async () => older,
      ),
    ).resolves.toMatchObject({ supersessionIntended: true });
    await expect(
      validateDeclaredBasis(
        { ...citation, revisionId: "unknown", supersessionIntended: true },
        current,
        async () => undefined,
      ),
    ).rejects.toThrow(/unknown/iu);
  });
  test("refuses missing current state even with retained history and supersession intent", async () => {
    await expect(
      validateDeclaredBasis(
        { ...basis, supersessionIntended: true },
        null,
        async () => current,
      ),
    ).rejects.toThrow(/current.*unknown/iu);
  });
  test("refuses wrong hashes and out-of-revision locators", async () => {
    await expect(
      validateDeclaredBasis(
        { ...basis, sha256: "0".repeat(64) },
        current,
        async () => undefined,
      ),
    ).rejects.toThrow(/hash/iu);
    await expect(
      validateDeclaredBasis(
        { ...basis, locators: [{ start: 0, end: 999 }] },
        current,
        async () => undefined,
      ),
    ).rejects.toThrow(/locator/iu);
  });
});
