import * as v from "valibot";

import type { WorkpieceRevision } from "@hashintel/brunch-agent/workpiece";

const nonempty = v.pipe(v.string(), v.minLength(1));
export const sha256Schema = v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/u));

/** Immutable revision-local UTF-16 spans; no cross-revision continuity claim. */
export const declaredBasisSchema = v.variant("kind", [
  v.strictObject({
    kind: v.literal("declared"),
    revisionId: nonempty,
    sha256: sha256Schema,
    locators: v.pipe(
      v.array(
        v.strictObject({
          start: v.pipe(v.number(), v.integer(), v.minValue(0)),
          end: v.pipe(v.number(), v.integer(), v.minValue(1)),
        }),
      ),
      v.minLength(1),
    ),
    rationale: nonempty,
    scope: v.literal("operation"),
    supersessionIntended: v.optional(v.boolean()),
  }),
  v.strictObject({ kind: v.literal("absent"), reason: nonempty }),
]);
export type DeclaredBasis = v.InferOutput<typeof declaredBasisSchema>;

/** Current state is authoritative; history is used only to resolve an explicit older citation. */
export const validateDeclaredBasis = async (
  input: unknown,
  current: WorkpieceRevision | null,
  retainedRevisionFor: (
    revisionId: string,
  ) => Promise<WorkpieceRevision | undefined>,
): Promise<DeclaredBasis> => {
  const basis = v.parse(declaredBasisSchema, input);
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
