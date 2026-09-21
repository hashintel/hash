import { z } from "zod";

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
