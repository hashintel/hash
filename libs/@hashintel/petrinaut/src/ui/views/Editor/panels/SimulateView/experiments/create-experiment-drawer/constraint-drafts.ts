/**
 * The Constraints section's state as plain data, and the transitions the
 * section applies to it: one ordered list of parameter and state rows, and
 * the pass threshold a state row is judged against.
 */
import type { ConstraintDraft } from "./constraint-lsp";

export type ConstraintDraftsState = {
  rows: ConstraintDraft[];
  /** The pass threshold in percent; null while the field is blank. Default 95. */
  passThresholdPercent: number | null;
};

/** The pass threshold in percent, the complement of the default alpha 0.05. */
export const DEFAULT_PASS_THRESHOLD_PERCENT = 95;

export const EMPTY_CONSTRAINT_DRAFTS: ConstraintDraftsState = {
  rows: [],
  passThresholdPercent: DEFAULT_PASS_THRESHOLD_PERCENT,
};

export const addConstraintDraft = (
  state: ConstraintDraftsState,
  draft: ConstraintDraft,
): ConstraintDraftsState => ({ ...state, rows: [...state.rows, draft] });

export const updateConstraintDraftCode = (
  state: ConstraintDraftsState,
  draftId: string,
  code: string,
): ConstraintDraftsState => ({
  ...state,
  rows: state.rows.map((row) => (row.id === draftId ? { ...row, code } : row)),
});

export const removeConstraintDraft = (
  state: ConstraintDraftsState,
  draftId: string,
): ConstraintDraftsState => ({
  ...state,
  rows: state.rows.filter((row) => row.id !== draftId),
});

/** Whether any row ranges over the simulation state, which is what a pass threshold judges. */
export const hasStateConstraintDraft = (
  state: ConstraintDraftsState,
): boolean => state.rows.some((row) => row.space === "state");
