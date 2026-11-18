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

/**
 * Bounds on how much of the editor's selection is restated to the model, Live
 * or the user. The whole selection is still read and sent; a restatement lists
 * at most `count` items and says how many more there are, and shortens each
 * label to `labelLength` characters.
 */
export const petrinautSelectionLimits = {
  count: 50,
  labelLength: 80,
} as const;

/**
 * The first items of a selection a restatement lists, in the selection's order
 * (Petrinaut's: by type, then id), and how many it leaves out.
 */
export const listedSelection = <Item>(
  items: readonly Item[],
): { readonly listed: readonly Item[]; readonly unlisted: number } => {
  const listed = items.slice(0, petrinautSelectionLimits.count);
  return { listed, unlisted: items.length - listed.length };
};

/** A selection label shortened with an ellipsis to the label limit. */
export const shortenedSelectionLabel = (label: string): string => {
  const characters = Array.from(label);
  return characters.length > petrinautSelectionLimits.labelLength
    ? `${characters.slice(0, petrinautSelectionLimits.labelLength - 1).join("")}…`
    : label;
};

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
