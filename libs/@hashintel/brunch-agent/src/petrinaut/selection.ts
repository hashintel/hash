import {
  canonicalizeSelection,
  selectionItemTypes,
  type SelectionItem,
} from "@hashintel/petrinaut-core/selection";

/** Bounds on the editor selection a contextual user message carries. */
export const petrinautSelectionLimits = {
  count: 50,
  idLength: 200,
} as const;

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
    id.length <= petrinautSelectionLimits.idLength &&
    !/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}<>]/u.test(id)
  );
};

/**
 * Read the editor's selection from untrusted submission context, as Petrinaut
 * orders it. A submission without one, or with an invalid one, selects
 * nothing.
 */
export const parseSelection = (value: unknown): readonly SelectionItem[] =>
  Array.isArray(value) &&
  value.length <= petrinautSelectionLimits.count &&
  value.every(isSelectionItem)
    ? canonicalizeSelection(
        value.map(({ type, id }) => ({ type, id }) as SelectionItem),
      )
    : [];
