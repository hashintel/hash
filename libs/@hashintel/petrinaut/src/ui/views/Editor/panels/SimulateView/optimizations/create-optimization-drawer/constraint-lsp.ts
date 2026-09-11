import { DiagnosticSeverity } from "@hashintel/petrinaut-core";

import { getConstraintDocumentUri } from "../../../../../../monaco/editor-paths";

import type { ConstraintSpace } from "@hashintel/petrinaut-core";

/** One constraint being authored: stable id + editable source. */
export type ConstraintDraft = { id: string; code: string };

/** The drafts of one constraint space, in display order. */
export type ConstraintDraftGroup = {
  space: ConstraintSpace;
  drafts: readonly ConstraintDraft[];
};

type DiagnosticLike = { message: string; severity?: DiagnosticSeverity };

const CONSTRAINT_SPACE_LABEL: Record<ConstraintSpace, string> = {
  parameters: "Parameter",
  state: "State",
};

/** `Parameter constraint 1`, `State constraint 2`: how a row is named to the user. */
export const describeConstraint = (
  space: ConstraintSpace,
  index: number,
): string => `${CONSTRAINT_SPACE_LABEL[space]} constraint ${index + 1}`;

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
 * The first error across the given drafts, prefixed with the row's name, or
 * null when every row is clean. Looks up each draft's own document URI rather
 * than the global constraint prefix, so a sibling drawer's session cannot
 * block this one.
 */
export const summarizeConstraintLspErrors = (
  diagnosticsByUri: ReadonlyMap<string, ReadonlyArray<DiagnosticLike>>,
  groups: readonly ConstraintDraftGroup[],
): string | null => {
  for (const { space, drafts } of groups) {
    for (const [index, draft] of drafts.entries()) {
      const message = getConstraintErrorMessage(diagnosticsByUri, draft.id);
      if (message !== undefined) {
        return `${describeConstraint(space, index)}: ${message}`;
      }
    }
  }
  return null;
};
