import { useCallback, useMemo, useRef, useState } from "react";

/**
 * Sentinel cursor part for the first page, which has no originating cursor.
 * Pages are keyed by their cursor so a page is replaced (not duplicated) if its
 * query resolves twice - e.g. a cache hit then a network response.
 */
export const initialCursorKey = "__initial__";

/**
 * Separator between a page key's generation prefix and cursor part. A key is
 * `${generation} ${cursorPart}`; the generation is a leading integer, so the
 * cursor part is everything after the *first* separator (the cursor's JSON may
 * contain the separator too).
 */
const generationSeparator = " ";

/**
 * A stable key identifying both the cursor that produced a page and the query
 * generation it was fetched under. The generation is what marks a late page
 * from a superseded query as stale: every query's first page shares
 * {@link initialCursorKey}, so without it a late completion of the old query
 * couldn't be told from the new query's first page.
 */
export const cursorKeyFor = <Cursor>(
  generation: number,
  cursor: Cursor | undefined,
): string =>
  `${generation}${generationSeparator}${
    cursor === undefined ? initialCursorKey : JSON.stringify(cursor)
  }`;

/** Split a {@link cursorKeyFor} key back into its generation and cursor part. */
const parseCursorKey = (
  cursorKey: string,
): { generation: number; cursorPart: string } => {
  const separatorIndex = cursorKey.indexOf(generationSeparator);
  return {
    generation: Number(cursorKey.slice(0, separatorIndex)),
    cursorPart: cursorKey.slice(separatorIndex + 1),
  };
};

/**
 * Drives cursor-based pagination, folding each loaded page into a running
 * accumulation and exposing `loadMore` to advance the cursor.
 *
 * Callers supply `seed` (build the empty accumulator from the first page) and
 * `appendPage` (fold one page in; it must expose `nextCursor`, or `null` when
 * exhausted). Both, and `finalize`, must be referentially stable, as the
 * accumulation only recomputes when `pages` changes.
 *
 * The fold is incremental: while `pages` grows by append (infinite scroll) only
 * the new pages are folded in, so loading page `k` costs O(page size). A reset
 * or in-place page replacement rebuilds from scratch (rare and bounded).
 *
 * The caller issues the query for the current `cursor` and calls `addPage` with
 * the result, stamping it with the `cursorKey` this hook returns (it encodes
 * the cursor and generation, so a late completion of a superseded query is
 * dropped).
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
   * When this changes, the accumulated pages and cursor are discarded
   * Done during render rather than in an effect, so the stale cursor
   * is never sent with the new query.
   */
  resetKey: string;
  /** Build the empty accumulator from the first page. */
  seed: (firstPage: Page) => Accumulated;
  /** Fold one page into the running accumulation. */
  appendPage: (accumulated: Accumulated, page: Page) => Accumulated;
  /**
   * Optional transform applied before the accumulation is returned, e.g. to
   * hand out fresh references for collections `appendPage` mutates in place.
   * Runs only when the accumulation recomputes.
   */
  finalize?: (accumulated: Accumulated) => Accumulated;
}): {
  /** The cursor for the page to fetch next, to feed into the query. */
  cursor: Cursor | undefined;
  /** Key for the current cursor, to stamp onto the page passed to `addPage`. */
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

  /**
   * Bumped whenever the query identity changes, so pages carry the generation
   * they were fetched under.
   */
  const generationRef = useRef(0);

  const previousResetKey = useRef(resetKey);
  if (previousResetKey.current !== resetKey) {
    previousResetKey.current = resetKey;
    // Advance the generation before discarding the stale cursor/pages, so the
    // new query stamps its pages with the new generation and a late completion
    // of the previous query is dropped by `addPage`.
    generationRef.current += 1;
    if (cursor !== undefined) {
      setCursor(undefined);
    }
    if (pages.length > 0) {
      setPages([]);
    }
  }

  const addPage = useCallback((page: Page) => {
    const { generation, cursorPart } = parseCursorKey(page.cursorKey);

    // Ignore pages from a superseded query.
    if (generation !== generationRef.current) {
      return;
    }

    setPages((previousPages) => {
      if (cursorPart === initialCursorKey) {
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
   * The last-processed `pages` and its accumulation, cached so an append-only
   * growth of `pages` only folds in the new pages (see the hook docs).
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
    cursorKey: cursorKeyFor(generationRef.current, cursor),
    pageCount: pages.length,
    addPage,
    accumulated,
    loadMore,
    hasMore: !!accumulated?.nextCursor,
  };
};
