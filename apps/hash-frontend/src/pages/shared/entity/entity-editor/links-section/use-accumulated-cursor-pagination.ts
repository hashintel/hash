import { useCallback, useRef, useState } from "react";

/**
 * Sentinel key for the first page, which is requested with no cursor. Pages are
 * keyed by their cursor so the position a completion would advance to can be
 * compared against the request currently in flight.
 */
const initialCursorKey = "__initial__";

/** A stable string key identifying the cursor a page was fetched with. */
const cursorKeyOf = (cursor: unknown): string =>
  cursor === undefined ? initialCursorKey : JSON.stringify(cursor);

/**
 * The fold passed to `appendPage`: merge one loaded page into the running
 * accumulation, and report how to fetch the page after it — a `getNextPage`
 * thunk producing the next request, or `false` when the loaded page was the
 * last.
 */
type AppendFold<T, Page> = (prevAccumulated: T) => {
  accumulated: T;
  getNextPage: (() => Page) | false;
};

/**
 * Drives cursor-based pagination, folding each loaded page into a running
 * accumulation and exposing `loadMore` to advance to the next page.
 *
 * The caller issues the query for the current `page` request (reading the
 * cursor to send from it) and, from the query's completion handler, calls
 * `appendPage` with a fold that merges the freshly-loaded page into the running
 * accumulation and returns a `getNextPage` thunk for the page after it (or
 * `false` when there are no more). The fold must be idempotent in the page it
 * adds (e.g. dedupe by id) so a cache-then-network double completion folds the
 * same page in twice without duplicating its rows.
 */
export const useAccumulatedCursorPagination = <
  T,
  Page extends { cursor: unknown } = { cursor: string; nextCursor: string },
>({
  resetKey,
  initial,
}: {
  /** When this changes, the accumulation and current request are discarded. */
  resetKey: string;
  /** The empty accumulation that the first (and every) page is folded into. Must be referentially stable */
  initial: T;
}): {
  /** The current page or `undefined` for the first page (which is fetched with no cursor). */
  page: Page | undefined;
  /** The accumulation of every page loaded so far, or `undefined` if none. */
  accumulated: T | undefined;
  /**
   * Record a freshly-loaded page (call from the query's completion handler),
   * passing a fold that merges it into the running accumulation and reports how
   * to fetch the next page.
   */
  appendPage: (fold: AppendFold<T, Page>) => void;
  /** Advance to the next page (no-op if there are no more pages). */
  loadMore: () => void;
  /** Whether there are more pages to fetch. */
  hasMore: boolean;
} => {
  const [page, setPage] = useState<Page | undefined>(undefined);
  const [{ accumulated, getNextPage }, setAccumulation] = useState<{
    accumulated: T | undefined;
    /**
     * How to fetch the page after the last folded one: a thunk while more
     * remain, `false` once the last page has been folded, `undefined` before
     * any page has.
     */
    getNextPage: (() => Page) | false | undefined;
  }>({ accumulated: undefined, getNextPage: undefined });

  const previousResetKey = useRef(resetKey);
  if (previousResetKey.current !== resetKey) {
    previousResetKey.current = resetKey;
    // Discard the stale request and accumulation during render, so the new
    // query is never issued with the old cursor.
    if (page !== undefined) {
      setPage(undefined);
    }
    if (accumulated !== undefined || getNextPage !== undefined) {
      setAccumulation({ accumulated: undefined, getNextPage: undefined });
    }
  }

  /**
   * The request currently being fetched, read by `appendPage` to tell a page
   * for the active query from a stale completion of a superseded one.
   */
  const requestRef = useRef<Page | undefined>(page);
  requestRef.current = page;
  const initialRef = useRef(initial);
  initialRef.current = initial;

  const appendPage = useCallback((fold: AppendFold<T, Page>) => {
    setAccumulation((previous) => {
      const folded = fold(previous.accumulated ?? initialRef.current);

      // `getNextPage` reports the page to fetch after the one that just
      // completed. If that next page is the request already in flight, this is
      // a late re-completion of the page before it (the cursor has since
      // advanced), so the already-folded `previous` is kept to avoid regressing
      // the cursor. Otherwise it is the active request's own completion (incl. a
      // cache-then-network re-completion of it, which the idempotent fold
      // absorbs), so accept it and record where to advance to next.
      if (
        folded.getNextPage !== false &&
        cursorKeyOf(folded.getNextPage().cursor) ===
          cursorKeyOf(requestRef.current?.cursor)
      ) {
        return previous;
      }

      return {
        accumulated: folded.accumulated,
        getNextPage: folded.getNextPage,
      };
    });
  }, []);

  const getNextPageRef = useRef(getNextPage);
  getNextPageRef.current = getNextPage;

  const loadMore = useCallback(() => {
    const next = getNextPageRef.current;
    if (next === undefined || next === false) {
      return;
    }
    setPage(next());
  }, []);

  const hasMore = getNextPage !== undefined && getNextPage !== false;

  return {
    page,
    accumulated,
    appendPage,
    loadMore,
    hasMore,
  };
};
