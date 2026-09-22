import * as v from "valibot";
import { z } from "zod";

import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import type {
  WorkpieceEvidenceRelation,
  WorkpieceRevision,
} from "@hashintel/brunch-agent/workpiece";

const nonempty = z.string().min(1);
export const sha256Pattern = /^[a-f0-9]{64}$/u;
export const sha256Schema = z.string().regex(sha256Pattern);

// Tool inputs are Zod by contract, so these cannot import core's Valibot
// schemas; the `satisfies` pins them to core's shapes so drift fails to compile.
const revisionCitation = z.strictObject({
  revisionId: nonempty.describe(
    "Copy the revisionId from the successful mutate_workpiece result that settled the cited revision (or a read_workpiece of it). A failed or pointer-only result has no reusable revision ID.",
  ),
  sha256: sha256Schema.describe(
    "Copy that same settled workpiece revision's sha256 from the same result, not the browser net hash.",
  ),
}) satisfies z.ZodType<Pick<WorkpieceRevision, "revisionId" | "sha256">>;
const locator = z.strictObject({
  start: z
    .number()
    .int()
    .min(0)
    .describe(
      "Inclusive UTF-16 offset copied from the settlement output's evidence[] locators, or from read_workpiece locateTexts against this settled revision when that output did not return the span. Do not count offsets yourself.",
    ),
  end: z
    .number()
    .int()
    .min(1)
    .describe(
      "Exclusive UTF-16 end offset from that same match; must exceed start and stay within this revision's Markdown.",
    ),
}) satisfies z.ZodType<WorkpieceEvidenceRelation["locator"]>;

/** Immutable revision-local UTF-16 spans; no cross-revision continuity claim. */
export const declaredBasisSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("declared"),
    ...revisionCitation.shape,
    locators: z
      .array(locator)
      .min(1)
      .describe(
        "Passages supporting this representation. Copy locators from the settlement output's evidence[]; use read_workpiece locateTexts only for a span that output did not return, selecting relevant matches, not every match.",
      ),
    rationale: nonempty.describe(
      "Explain how the cited operational meaning supports this operation; distinguish representational inference from user testimony.",
    ),
    scope: z
      .literal("operation")
      .describe(
        "Basis covers the logical operation, not independent support for every field or derived effect.",
      ),
    supersessionIntended: z
      .boolean()
      .optional()
      .describe(
        "Set true only to intentionally cite a retained, superseded workpiece revision. Normally use the current revision; this does not waive hash or locator validation.",
      ),
  }),
  z.strictObject({
    kind: z.literal("absent"),
    reason: nonempty.describe(
      "Explain why no recorded passage supports this operation. This discloses absent provenance; it does not authorize inventing operational facts or bypass the need for a settled workpiece.",
    ),
  }),
]);
export type DeclaredBasis = z.output<typeof declaredBasisSchema>;

export const declarePetrinautProjectionToolName =
  "declare_petrinaut_projection";

export const DECLARED_PROJECTION_CANONICAL_TOOL_NAMES = [
  "addPlace",
  "addTransition",
  "addArc",
] as const satisfies readonly (keyof typeof petrinautAiTools)[];

const declaredProjectionOperationSchema = z.strictObject({
  operationId: nonempty
    .max(128)
    .describe(
      "Stable semantic identity for this intended operation; reuse it when referring to the same intention.",
    ),
  toolName: z
    .enum(DECLARED_PROJECTION_CANONICAL_TOOL_NAMES)
    .describe(
      "Canonical Petrinaut operation intended to realize this declaration later.",
    ),
  intendedEffect: nonempty
    .max(1000)
    .describe(
      "The intended semantic change, stated as intention rather than an observed result.",
    ),
  intendedTarget: nonempty
    .max(500)
    .describe(
      "The semantic thing this operation is intended to create or connect.",
    ),
  expectedImpact: z
    .array(nonempty.max(500))
    .min(1)
    .max(8)
    .superRefine((impacts, context) => {
      const seen = new Set<string>();
      for (const [index, impact] of impacts.entries()) {
        if (seen.has(impact))
          context.addIssue({
            code: "custom",
            path: [index],
            message: "Expected impacts must be distinct",
          });
        seen.add(impact);
      }
    })
    .describe(
      "Frozen bounded set of semantic definitions expected to change if this operation is later applied. This is an expectation, not an observed effect.",
    ),
  evidence: z
    .strictObject({
      excerpts: z
        .array(nonempty.max(4096))
        .min(1)
        .max(8)
        .superRefine((excerpts, context) => {
          const seen = new Set<string>();
          for (const [index, excerpt] of excerpts.entries()) {
            if (seen.has(excerpt))
              context.addIssue({
                code: "custom",
                path: [index],
                message: "Ledger excerpts must be distinct",
              });
            seen.add(excerpt);
          }
        })
        .describe(
          "Literal passages copied exactly from the current settled Ledger. Each passage must occur exactly once there.",
        ),
      rationale: nonempty
        .max(2000)
        .describe(
          "Why these passages support the intended operation, without claiming that the operation happened.",
        ),
    })
    .optional()
    .describe(
      "Optional current-Ledger support for this intention. Omit it when no exact passage supports the operation.",
    ),
});

/** Model-authored semantics only; all authority and offsets are attached by the host. */
export const declaredProjectionInputSchema = z
  .strictObject({
    operations: z
      .array(declaredProjectionOperationSchema)
      .min(1)
      .max(3)
      .describe(
        "Bounded intended projection in dependency order. This declaration does not execute these operations.",
      ),
  })
  .superRefine(({ operations }, context) => {
    const operationIds = new Set<string>();
    let previousToolRank = -1;
    for (const [index, { operationId, toolName }] of operations.entries()) {
      if (operationIds.has(operationId))
        context.addIssue({
          code: "custom",
          path: ["operations", index, "operationId"],
          message: "operationId must be unique",
        });
      operationIds.add(operationId);

      const toolRank =
        DECLARED_PROJECTION_CANONICAL_TOOL_NAMES.indexOf(toolName);
      if (toolRank < previousToolRank)
        context.addIssue({
          code: "custom",
          path: ["operations", index, "toolName"],
          message:
            "Operations must be ordered addPlace, then addTransition, then addArc",
        });
      previousToolRank = toolRank;
    }
  });

export type DeclaredProjectionInput = z.output<
  typeof declaredProjectionInputSchema
>;

export const declaredProjectionOutputSchema = v.strictObject({
  standing: v.literal("intent-only"),
  revision: v.strictObject({
    revisionId: v.string(),
    sha256: v.string(),
    ordinal: v.number(),
  }),
  operations: v.array(
    v.strictObject({
      operationId: v.string(),
      toolName: v.picklist(DECLARED_PROJECTION_CANONICAL_TOOL_NAMES),
      intendedEffect: v.string(),
      intendedTarget: v.string(),
      expectedImpact: v.array(v.string()),
      basis: v.union([
        v.strictObject({
          kind: v.literal("declared"),
          revisionId: v.string(),
          sha256: v.string(),
          locators: v.array(
            v.strictObject({ start: v.number(), end: v.number() }),
          ),
          rationale: v.string(),
          scope: v.literal("operation"),
        }),
        v.strictObject({
          kind: v.literal("absent"),
          reason: v.string(),
        }),
      ]),
    }),
  ),
});

export type DeclaredProjectionOutput = v.InferOutput<
  typeof declaredProjectionOutputSchema
>;

const resolveUniqueExcerpt = (markdown: string, excerpt: string) => {
  const start = markdown.indexOf(excerpt);
  if (start === -1)
    throw new Error(
      "A declared Ledger excerpt is missing from the current settled revision.",
    );
  if (markdown.indexOf(excerpt, start + 1) !== -1)
    throw new Error(
      "A declared Ledger excerpt is ambiguous in the current settled revision.",
    );
  return { start, end: start + excerpt.length };
};

export const resolveDeclaredProjectionOutput = (
  input: DeclaredProjectionInput,
  currentRevision: WorkpieceRevision,
): DeclaredProjectionOutput => ({
  standing: "intent-only",
  revision: {
    revisionId: currentRevision.revisionId,
    sha256: currentRevision.sha256,
    ordinal: currentRevision.ordinal,
  },
  operations: input.operations.map(({ evidence, ...operation }) => ({
    ...operation,
    basis: evidence
      ? {
          kind: "declared" as const,
          revisionId: currentRevision.revisionId,
          sha256: currentRevision.sha256,
          locators: evidence.excerpts.map((excerpt) =>
            resolveUniqueExcerpt(currentRevision.markdown, excerpt),
          ),
          rationale: evidence.rationale,
          scope: "operation" as const,
        }
      : {
          kind: "absent" as const,
          reason: "No Ledger excerpt was declared for this intended operation.",
        },
  })),
});

const canonicalJson = (value: unknown): string => {
  const normalize = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (typeof entry === "object" && entry !== null) {
      const record = entry as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(record)
          .sort()
          .map((key) => [key, normalize(record[key])]),
      );
    }
    return entry;
  };
  return JSON.stringify(normalize(value));
};

const sha256Text = async (value: string): Promise<string> => {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
};

/** Re-derive and verify a recorded declaration from its issued semantics and then-current settled Ledger. */
export const verifyDeclaredProjectionOutput = async (input: {
  issuedInput: unknown;
  recordedOutput: unknown;
  currentRevision: WorkpieceRevision;
}): Promise<DeclaredProjectionOutput> => {
  const issuedInput = declaredProjectionInputSchema.parse(input.issuedInput);
  const recordedOutput = v.parse(
    declaredProjectionOutputSchema,
    input.recordedOutput,
  );
  if (
    (await sha256Text(input.currentRevision.markdown)) !==
    input.currentRevision.sha256
  )
    throw new Error("Current Ledger revision hash does not match its content.");
  const expected = resolveDeclaredProjectionOutput(
    issuedInput,
    input.currentRevision,
  );
  if (canonicalJson(recordedOutput) !== canonicalJson(expected))
    throw new Error(
      "Recorded Petrinaut projection does not match its issued semantics and current Ledger revision.",
    );
  return recordedOutput;
};

/** Current state is authoritative; history is used only to resolve an explicit older citation. */
export const validateDeclaredBasis = async (
  input: unknown,
  current: WorkpieceRevision | null,
  retainedRevisionFor: (
    revisionId: string,
  ) => Promise<WorkpieceRevision | undefined>,
): Promise<DeclaredBasis> => {
  const basis = declaredBasisSchema.parse(input);
  if (basis.kind === "absent") return basis;
  if (!current)
    throw new Error(
      "Current workpiece state is unknown; retained history cannot replace it.",
    );
  const revision =
    current.revisionId === basis.revisionId
      ? current
      : await retainedRevisionFor(basis.revisionId);
  if (!revision) throw new Error("Unknown settled workpiece revision.");
  if (revision.sha256 !== basis.sha256)
    throw new Error("Workpiece citation hash mismatch.");
  if (
    revision.revisionId !== current.revisionId &&
    basis.supersessionIntended !== true
  )
    throw new Error(
      "The cited workpiece revision is superseded; explicit supersession intent is required.",
    );
  if (
    basis.locators.some(
      ({ start, end }) => start >= end || end > revision.markdown.length,
    )
  )
    throw new Error("Workpiece locator is outside the cited revision.");
  return basis;
};
