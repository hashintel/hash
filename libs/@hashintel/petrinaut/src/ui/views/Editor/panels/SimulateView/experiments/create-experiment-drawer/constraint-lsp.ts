import { DiagnosticSeverity } from "@hashintel/petrinaut-core";

import { getConstraintDocumentUri } from "../../../../../../monaco/editor-paths";

import type { ConstraintSpace } from "@hashintel/petrinaut-core";

/** One constraint being authored: stable id, the space it ranges over, editable source. */
export type ConstraintDraft = {
  id: string;
  space: ConstraintSpace;
  code: string;
};

type DiagnosticLike = { message: string; severity?: DiagnosticSeverity };

const CONSTRAINT_SPACE_LABEL: Record<ConstraintSpace, string> = {
  parameters: "Parameter",
  state: "State",
};

/**
 * `Parameter constraint 2`, `State constraint 1`: how a row is named to the
 * user, its ordinal counted within the row's space across the one ordered
 * list. A draft the list does not hold counts after its space's last row.
 */
export const describeConstraint = (
  draft: ConstraintDraft,
  drafts: readonly ConstraintDraft[],
): string => {
  const sameSpace = drafts.filter(
    (candidate) => candidate.space === draft.space,
  );
  const index = sameSpace.findIndex((candidate) => candidate.id === draft.id);
  const ordinal = (index === -1 ? sameSpace.length : index) + 1;
  return `${CONSTRAINT_SPACE_LABEL[draft.space]} constraint ${ordinal}`;
};

/**
 * The first error-severity diagnostic on a constraint draft's document.
 * Warnings and hints (HIR lints) never block a row.
 */
export const getConstraintErrorMessage = (
  diagnosticsByUri: ReadonlyMap<string, ReadonlyArray<DiagnosticLike>>,
  draftId: string,
): string | undefined =>
  diagnosticsByUri
    .get(getConstraintDocumentUri(draftId))
    ?.find((diagnostic) => diagnostic.severity === DiagnosticSeverity.Error)
    ?.message;

/**
 * The first error across the non-blank drafts, in list order, prefixed with
 * the row's name; null when every row is clean. A blank row is skipped at
 * submission, so its diagnostics never block. Looks up each draft's own
 * document URI rather than the global constraint prefix, so a sibling
 * drawer's session cannot block this one.
 */
export const summarizeConstraintLspErrors = (
  diagnosticsByUri: ReadonlyMap<string, ReadonlyArray<DiagnosticLike>>,
  drafts: readonly ConstraintDraft[],
): string | null => {
  for (const draft of drafts) {
    if (draft.code.trim() === "") {
      continue;
    }
    const message = getConstraintErrorMessage(diagnosticsByUri, draft.id);
    if (message !== undefined) {
      return `${describeConstraint(draft, drafts)}: ${message}`;
    }
  }
  return null;
};
