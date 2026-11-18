import {
  canonicalizeSelection,
  selectionItemTypes,
  type SelectionItem,
} from "@hashintel/petrinaut-core/selection";

/** The host's submission-context key for the editor's selection. */
export const selectionContextKey = "selection";

const isSelectionItem = (value: unknown): value is SelectionItem => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const { type, id } = value as Record<string, unknown>;
  return (
    selectionItemTypes.includes(type as SelectionItem["type"]) &&
    typeof id === "string" &&
    id.length > 0 &&
    !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}<>]/u.test(id)
  );
};

/**
 * Read the editor's selection from untrusted submission context, as Petrinaut
 * orders it. A submission without one, or with an invalid one, selects
 * nothing.
 */
export const parseSelection = (value: unknown): readonly SelectionItem[] =>
  Array.isArray(value) && value.every(isSelectionItem)
    ? canonicalizeSelection(
        value.map(({ type, id }) => ({ type, id }) as SelectionItem),
      )
    : [];

/** The editor's selection, with a label naming each item for the user or a voice. */
export interface EditorSelection {
  readonly items: readonly SelectionItem[];
  readonly labels: readonly string[];
}

/**
 * One turn's selection from the selections of several merged utterances, in
 * spoken order: the newest that selected something, since a later "no, this
 * one" corrects an earlier "this". An utterance that ended with nothing
 * selected leaves an earlier selection standing, so a follow-up spoken after
 * clicking empty canvas still means it. Empty when every utterance selected
 * nothing; undefined when none carried a selection.
 */
export const newestNonEmptySelection = (
  selections: readonly (readonly SelectionItem[] | undefined)[],
): readonly SelectionItem[] | undefined => {
  const present = selections.filter((selection) => selection !== undefined);
  return present.findLast((selection) => selection.length > 0) ?? present[0];
};
