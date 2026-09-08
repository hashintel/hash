import { z } from "zod";

import type { WorkpieceRevision } from "@hashintel/brunch-agent/workpiece";

const nonempty = z.string().min(1);
export const sha256Pattern = /^[a-f0-9]{64}$/u;
export const sha256Schema = z.string().regex(sha256Pattern);

/** Immutable revision-local UTF-16 spans; no cross-revision continuity claim. */
export const declaredBasisSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("declared"),
    revisionId: nonempty,
    sha256: sha256Schema,
    locators: z
      .array(
        z.strictObject({
          start: z.number().int().min(0),
          end: z.number().int().min(1),
        }),
      )
      .min(1),
    rationale: nonempty,
    scope: z.literal("operation"),
    supersessionIntended: z.boolean().optional(),
  }),
  z.strictObject({ kind: z.literal("absent"), reason: nonempty }),
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
  const revision =
    current?.revisionId === basis.revisionId
      ? current
      : await retainedRevisionFor(basis.revisionId);
  if (!revision) throw new Error("Unknown settled workpiece revision.");
  if (revision.sha256 !== basis.sha256)
    throw new Error("Workpiece citation hash mismatch.");
  if (
    revision.revisionId !== current?.revisionId &&
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
