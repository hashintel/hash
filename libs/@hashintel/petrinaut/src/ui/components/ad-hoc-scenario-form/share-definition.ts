/**
 * Keeps the objects of the definition the form already shows wherever a new
 * definition says the same.
 *
 * The form's cells read their own part of the definition and render when
 * that part is a new object. The reducer keeps every part an edit leaves
 * alone, but a host may build the whole definition again on any render: the
 * run form's host materializes it from the scenario it shows, with every
 * place and parameter a new object that says what the last one said. Sharing
 * by content at the form's edge lets a cell compare by identity and still
 * render only for a change.
 */

import type { AdHocScenarioState } from "@hashintel/petrinaut-core";

/** Plain JSON data throughout, so equal text is equal content. */
const sameContent = (previous: unknown, next: unknown): boolean =>
  previous === next || JSON.stringify(previous) === JSON.stringify(next);

const shareItems = <Item>(previous: Item[], next: Item[]): Item[] => {
  if (previous === next) {
    return previous;
  }
  const shared = next.map((item, index) => {
    const before = previous[index];
    return before !== undefined && sameContent(before, item) ? before : item;
  });
  if (
    shared.length === previous.length &&
    shared.every((item, index) => item === previous[index])
  ) {
    return previous;
  }
  // `next` shares all it can already: keep its own list.
  return shared.every((item, index) => item === next[index]) ? next : shared;
};

const sharePlaces = (
  previous: AdHocScenarioState["places"],
  next: AdHocScenarioState["places"],
): AdHocScenarioState["places"] => {
  if (previous === next) {
    return previous;
  }
  const previousIds = Object.keys(previous);
  const entries = Object.entries(next).map(([placeId, place]) => {
    const before = previous[placeId];
    return [
      placeId,
      before !== undefined && sameContent(before, place) ? before : place,
    ] as const;
  });
  const unchanged =
    entries.length === previousIds.length &&
    entries.every(
      ([placeId, place], index) =>
        previousIds[index] === placeId && previous[placeId] === place,
    );
  if (unchanged) {
    return previous;
  }
  // `next` shares all it can already: keep its own record.
  return entries.every(([placeId, place]) => next[placeId] === place)
    ? next
    : Object.fromEntries(entries);
};

/**
 * `next`, with every part that says what `previous` says replaced by the
 * object `previous` holds. Returns `previous` itself when nothing changed,
 * and `next` itself when it shares all it can already: the result of an
 * edit through the reducer does, and the undo history holds that object.
 */
export const shareAdHocState = (
  previous: AdHocScenarioState,
  next: AdHocScenarioState,
): AdHocScenarioState => {
  if (previous === next) {
    return previous;
  }
  const variables = shareItems(previous.variables, next.variables);
  const netParameters = shareItems(previous.netParameters, next.netParameters);
  const places = sharePlaces(previous.places, next.places);
  if (
    variables === previous.variables &&
    netParameters === previous.netParameters &&
    places === previous.places
  ) {
    return previous;
  }
  if (
    variables === next.variables &&
    netParameters === next.netParameters &&
    places === next.places
  ) {
    return next;
  }
  return { ...next, variables, netParameters, places };
};
