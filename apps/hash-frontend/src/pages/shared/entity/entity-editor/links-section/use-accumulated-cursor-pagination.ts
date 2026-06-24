import { useCallback, useRef, useState } from "react";

/**
 * Sentinel key for the first page, which is requested with no cursor. Pages are
 * keyed by their cursor so a re-completion of the same query (cache then
 * network) is recognised, and a stale completion of a superseded query dropped.
 */
const initialCursorKey = "__initial__";

/** A stable string key identifying the cursor a page was fetched with. */
const cursorKeyOf = (cursor: unknown): string =>
  cursor === undefined ? initialCursorKey : JSON.stringify(cursor);

/** The fold passed to `appendPage`: merge one loaded page into the running accumulation. */
type AppendFold<T, Page> = (
  prevAccumulated: T,
  prevPage: Page | undefined,
) => { accumulated: T; page: Page };

/**
 * Drives cursor-based pagination, folding each loaded page into a running
 * accumulation and exposing `loadMore` to advance to the next page.
 *
 * The caller issues the query for the current `page` request (reading the
 * cursor to send from it) and, from the query's completion handler, calls
 * `appendPage` with a fold that merges the freshly-loaded page into the running
 * accumulation. The fold must be idempotent in the page it adds (e.g. dedupe by id)
 * so a cache-then-network double completion folds the same page in twice without duplicating its rows.
 */
export const useAccumulatedCursorPagination = <
  T,
  Page extends { cursor: unknown } = { cursor: string; nextCursor: string },
>({
  resetKey,
  initial,
  getNextPage,
}: {
  /** When this changes, the accumulation and current request are discarded. */
  resetKey: string;
  /** The empty accumulation that the first (and every) page is folded into. Must be referentially stable */
  initial: T;
  /** Derive the request for the next page from a normalized page, or `false` when there are no more pages. Must be referentially stable */
  getNextPage: (prevPage: Page) => Page | false;
}): {
  /** The current page or `undefined` for the first page (which is fetched with no cursor). */
  page: Page | undefined;
  /** The accumulation of every page loaded so far, or `undefined` if none. */
  accumulated: T | undefined;
  /**
   * Record a freshly-loaded page (call from the query's completion handler),
   * passing a fold that merges it into the running accumulation.
   */
  appendPage: (fold: AppendFold<T, Page>) => void;
  /** Advance to the next page (no-op if there are no more pages). */
  loadMore: () => void;
  /** Whether there are more pages to fetch. */
  hasMore: boolean;
} => {
  const [page, setPage] = useState<Page | undefined>(undefined);
  const [{ accumulated, lastPage }, setAccumulation] = useState<{
    accumulated: T | undefined;
    lastPage: Page | undefined;
  }>({ accumulated: undefined, lastPage: undefined });

  const previousResetKey = useRef(resetKey);
  if (previousResetKey.current !== resetKey) {
    previousResetKey.current = resetKey;
    // Discard the stale request and accumulation during render, so the new
    // query is never issued with the old cursor.
    if (page !== undefined) {
      setPage(undefined);
    }
    if (accumulated !== undefined || lastPage !== undefined) {
      setAccumulation({ accumulated: undefined, lastPage: undefined });
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
  const getNextPageRef = useRef(getNextPage);
  getNextPageRef.current = getNextPage;

  const appendPage = useCallback((fold: AppendFold<T, Page>) => {
    setAccumulation((previous) => {
      const folded = fold(
        previous.accumulated ?? initialRef.current,
        previous.lastPage,
      );
      const key = cursorKeyOf(folded.page.cursor);

      // Accept the page only if it is the one currently being requested, or a
      // re-completion of the last loaded page (cache then network). A cursor
      // matching neither is a late completion of a superseded query, so the
      // already-folded `previous` is kept unchanged.
      const isActiveRequest = key === cursorKeyOf(requestRef.current?.cursor);
      const isReCompletion =
        previous.lastPage !== undefined &&
        key === cursorKeyOf(previous.lastPage.cursor);
      if (!isActiveRequest && !isReCompletion) {
        return previous;
      }

      return { accumulated: folded.accumulated, lastPage: folded.page };
    });
  }, []);

  const lastPageRef = useRef<Page | undefined>(lastPage);
  lastPageRef.current = lastPage;

  const loadMore = useCallback(() => {
    const last = lastPageRef.current;
    if (last === undefined) {
      return;
    }
    const next = getNextPageRef.current(last);
    if (next !== false) {
      setPage(next);
    }
  }, []);

  const hasMore =
    lastPage !== undefined && getNextPageRef.current(lastPage) !== false;

  return {
    page,
    accumulated,
    appendPage,
    loadMore,
    hasMore,
  };
};
