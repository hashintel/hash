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

import { useState } from "react";

/** A list or a record: the definition is plain JSON data throughout. */
const isCollection = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * `next`, with every part that says what `previous` says replaced by the
 * object `previous` holds, at every depth:
 *
 * - `previous` itself when nothing changed;
 * - `next` itself when it shares all it can already. The result of an edit
 *   through the reducer does, and the undo history holds that object;
 * - otherwise a copy of `next` whose unchanged parts are those of
 *   `previous`.
 */
export const shareContent = <Value>(previous: Value, next: Value): Value => {
  if (
    previous === next ||
    !isCollection(previous) ||
    !isCollection(next) ||
    Array.isArray(previous) !== Array.isArray(next)
  ) {
    return next;
  }
  const previousKeys = Object.keys(previous);
  const entries = Object.entries(next).map(
    ([key, value]) => [key, shareContent(previous[key], value)] as const,
  );
  const unchanged =
    entries.length === previousKeys.length &&
    entries.every(
      ([key, value], index) =>
        key === previousKeys[index] && value === previous[key],
    );
  if (unchanged) {
    return previous;
  }
  if (entries.every(([key, value]) => value === next[key])) {
    return next;
  }
  const shared = Array.isArray(next)
    ? entries.map(([, value]) => value)
    : Object.fromEntries(entries);
  return shared as Value;
};

/**
 * `given`, shared by content with the value this hook returned before.
 * State adjusted during render: what to share with is the last value shown,
 * which no prop carries.
 */
export const useSharedContent = <Value>(given: Value): Value => {
  const [content, setContent] = useState({ given, shown: given });
  if (content.given === given) {
    return content.shown;
  }
  const shown = shareContent(content.shown, given);
  setContent({ given, shown });
  return shown;
};
