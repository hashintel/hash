import { useCallback, useMemo, useRef, useState } from "react";

/**
 * Sentinel key for the first page, which has no originating cursor.
 *
 * Pages are keyed by the cursor that produced them so that a page is replaced
 * (rather than duplicated) if its query resolves more than once - e.g. a cache
 * hit followed by a network response for the same cursor.
 */
export const initialCursorKey = "__initial__";

/**
 * A stable string key for the cursor that produced a page, used to dedupe pages
 * (see {@link initialCursorKey}).
 */
export const cursorKeyFor = <Cursor>(cursor: Cursor | undefined): string =>
  cursor === undefined ? initialCursorKey : JSON.stringify(cursor);

/**
 * Drives cursor-based pagination where each loaded page is folded into a
 * running accumulation, exposing a `loadMore` to advance the cursor.
 *
 * The hook is agnostic to what a "page" or its accumulation contains: callers
 * supply
 * - `seed`, building the empty accumulator from the first page, and
 * - `appendPage`, folding one page into the accumulator (which must expose the
 *   `nextCursor` to advance to, or `null` when exhausted).
 *
 * The fold is incremental: as long as `pages` grows by append (the common
 * infinite-scroll case) only the newly-added pages are folded in, so loading
 * page `k` costs O(page size) rather than O(total pages loaded so far). A reset
 * or an in-place page replacement (cache-then-network for the same cursor)
 * rebuilds from scratch, which is rare and bounded.
 *
 * `seed`, `appendPage` and `finalize` must be referentially stable (e.g.
 * module-level constants or memoised), as the accumulation only recomputes when
 * `pages` changes.
 *
 * The caller is responsible for issuing the query for the current `cursor` and
 * calling `addPage` with the result; the page's `cursorKey` should be derived
 * from the `cursorKey` this hook returns (via {@link cursorKeyFor}).
 */
export const useAccumulatedCursorPagination = <
  Cursor,
  Page extends { cursorKey: string },
  Accumulated extends { nextCursor: Cursor | null },
>({
  resetKey,
  seed,
  appendPage,
  finalize,
}: {
  /**
   * When this changes, accumulated pages and the cursor are discarded (the
   * query identity, and therefore the cursors, are no longer valid). Done
   * during render rather than in an effect so that the stale cursor is never
   * sent alongside the new query.
   */
  resetKey: string;
  /** Build the empty accumulator from the first page. */
  seed: (firstPage: Page) => Accumulated;
  /** Fold one page into the running accumulation. */
  appendPage: (accumulated: Accumulated, page: Page) => Accumulated;
  /**
   * Optional transform applied to the accumulation before it is returned, e.g.
   * to hand out fresh references for collections that `appendPage` mutates in
   * place. Runs only when the accumulation recomputes.
   */
  finalize?: (accumulated: Accumulated) => Accumulated;
}): {
  /** The cursor for the page to fetch next, to feed into the query. */
  cursor: Cursor | undefined;
  /** The key for the current cursor, to stamp onto the page passed to `addPage`. */
  cursorKey: string;
  /** How many pages have been loaded so far. */
  pageCount: number;
  /** Record a freshly-loaded page (call from the query's completion handler). */
  addPage: (page: Page) => void;
  /** The accumulation of every page loaded so far, or `undefined` if none. */
  accumulated: Accumulated | undefined;
  /** Advance the cursor to the next page (no-op if there are no more pages). */
  loadMore: () => void;
  /** Whether there are more pages to fetch. */
  hasMore: boolean;
} => {
  const [cursor, setCursor] = useState<Cursor | undefined>(undefined);
  const [pages, setPages] = useState<Page[]>([]);

  const previousResetKey = useRef(resetKey);
  if (previousResetKey.current !== resetKey) {
    previousResetKey.current = resetKey;
    if (cursor !== undefined) {
      setCursor(undefined);
    }
    if (pages.length > 0) {
      setPages([]);
    }
  }

  const addPage = useCallback((page: Page) => {
    setPages((previousPages) => {
      if (page.cursorKey === initialCursorKey) {
        // First page - replace any accumulated pages.
        return [page];
      }

      const existingIndex = previousPages.findIndex(
        (previousPage) => previousPage.cursorKey === page.cursorKey,
      );

      if (existingIndex !== -1) {
        const next = [...previousPages];
        next[existingIndex] = page;
        return next;
      }

      return [...previousPages, page];
    });
  }, []);

  /**
   * The previously-processed `pages` array and its resulting accumulation are
   * cached here so that an append-only growth of `pages` only folds in the new
   * pages (see the hook docs).
   */
  const accumulationCache = useRef<{
    pages: Page[];
    result: Accumulated | undefined;
  }>({ pages: [], result: undefined });

  const seedRef = useRef(seed);
  seedRef.current = seed;
  const appendPageRef = useRef(appendPage);
  appendPageRef.current = appendPage;
  const finalizeRef = useRef(finalize);
  finalizeRef.current = finalize;

  const accumulated = useMemo<Accumulated | undefined>(() => {
    const cached = accumulationCache.current;

    const isAppendOnlyExtension =
      cached.result !== undefined &&
      pages.length > cached.pages.length &&
      cached.pages.every((page, index) => pages[index] === page);

    let result: Accumulated | undefined;
    if (pages.length === 0) {
      result = undefined;
    } else if (isAppendOnlyExtension) {
      result = cached.result;
      for (let index = cached.pages.length; index < pages.length; index++) {
        result = appendPageRef.current(result!, pages[index]!);
      }
    } else {
      result = pages.reduce(
        (accumulator, page) => appendPageRef.current(accumulator, page),
        seedRef.current(pages[0]!),
      );
    }

    // Cache the raw (pre-`finalize`) result so later appends build on it.
    accumulationCache.current = { pages, result };

    if (result === undefined) {
      return undefined;
    }

    return finalizeRef.current ? finalizeRef.current(result) : result;
  }, [pages]);

  const loadMore = useCallback(() => {
    if (accumulated?.nextCursor) {
      setCursor(accumulated.nextCursor);
    }
  }, [accumulated?.nextCursor]);

  return {
    cursor,
    cursorKey: cursorKeyFor(cursor),
    pageCount: pages.length,
    addPage,
    accumulated,
    loadMore,
    hasMore: !!accumulated?.nextCursor,
  };
};
