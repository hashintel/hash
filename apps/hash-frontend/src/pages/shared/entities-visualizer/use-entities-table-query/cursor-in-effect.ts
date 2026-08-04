/**
 * Which cursor a page request carries, of the one the caller asked for.
 *
 * A cursor only belongs to the sequence that handed it out. Sending a foreign
 * one — after a filter change, or a navigation that swaps the pinned type
 * without remounting the table — would skip the rows before it and suppress
 * the first page's summary, so it is dropped in favour of a first page.
 *
 * Whether a cursor is in effect also decides how a sequence restarts: with one
 * in effect, dropping it changes the request and the query re-runs on its own;
 * without one, the request is already the first page and only a network round
 * trip is missing.
 */
export const cursorInEffect = ({
  requestedCursor,
  requestKey,
  sequence,
}: {
  /** The cursor the caller asked to continue from. */
  requestedCursor: string | null;
  /** The sequence the current request belongs to. */
  requestKey: string | null;
  /** The sequence the accumulated pages belong to, if any. */
  sequence: { requestKey: string; issuedCursors: Set<string> } | null;
}): string | null => {
  if (requestedCursor === null || requestKey === null || sequence === null) {
    return null;
  }

  return sequence.requestKey === requestKey &&
    sequence.issuedCursors.has(requestedCursor)
    ? requestedCursor
    : null;
};
