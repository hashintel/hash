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

/** One turn's selection from several merged ones: every element any of them named. */
export const mergeSelections = (
  selections: readonly (readonly SelectionItem[] | undefined)[],
): readonly SelectionItem[] | undefined => {
  const present = selections.filter((selection) => selection !== undefined);
  return present.length === 0
    ? undefined
    : canonicalizeSelection(present.flat());
};
