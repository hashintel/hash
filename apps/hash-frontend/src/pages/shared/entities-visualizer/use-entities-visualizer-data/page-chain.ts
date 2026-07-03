/**
 * Pure state transitions for the visualizer's accumulated result pages.
 *
 * A {@link PageChain} is the ordered list of response pages fetched for one
 * specific set of query inputs (the `issuedFor` identity), plus the cursor
 * currently applied to the query. The chain is advanced during render via
 * {@link advancePageChain} whenever a response is available, which keeps the
 * accumulated pages a pure function of (previous chain, current inputs,
 * current response); there is no effect or completion callback involved.
 *
 * The chain also carries the user's pagination window: how many pages they
 * have expanded the results to ({@link PageChain.targetPageCount}). Cursors
 * are continuations of responses, so any input change forces a rebuilt chain
 * fetched from page one. When the change kept the same entity set, however
 * (same {@link PageChain.windowKey}: a view switch changing traversal paths,
 * a re-sort, a unit conversion), the rebuilt chain inherits the window and
 * auto-refills to it, advancing its cursor as each page arrives. This is what
 * makes every view show the same window of results: pages loaded in the
 * table are re-fetched (graph-shaped) for the graph rather than silently
 * collapsing back to page one.
 *
 * Invariants:
 * - `pages[0]` was requested without a cursor (the first page); every later
 *   page was requested with the cursor of the page before it.
 * - A response object is captured at most once (compared by identity).
 * - A re-delivered first page (refresh, cache update) discards all later
 *   pages, since they continued a result set that no longer exists; the
 *   window is kept, so the refill re-chases the dropped pages.
 */
import type { EntityQueryCursor } from "@local/hash-graph-client";

export interface ChainPage<Response> {
  /**
   * The exact response object this page was built from. Compared by identity
   * to recognize a response that has already been captured.
   */
  readonly sourceResponse: Response;
  /** The cursor this page was requested with; `undefined` for the first page. */
  readonly forCursor: EntityQueryCursor | undefined;
  /** Cursor for the page after this one; `null` when this is the last page. */
  readonly nextCursor: EntityQueryCursor | null;
}

export interface PageChain<Identity, Page> {
  /**
   * The query inputs these pages belong to, compared by identity. A chain
   * whose `issuedFor` is not the current identity is stale: it may still be
   * displayed while the first page for the new inputs loads, but its cursor
   * must not be applied to the query.
   */
  readonly issuedFor: Identity;
  /**
   * Identity of the displayed entity set plus the page size: the scope in
   * which {@link targetPageCount} is meaningful. Deliberately coarser than
   * `issuedFor`: inputs that only re-shape or re-order the same set
   * (traversal paths, sort, conversions) are excluded, so the window
   * survives them; a different key (filter change) resets the window.
   */
  readonly windowKey: string;
  /** The cursor applied to the in-flight or most recent request; `undefined` requests the first page. */
  readonly activeCursor: EntityQueryCursor | undefined;
  /**
   * The user's pagination window: 1 + the number of "Show more" clicks for
   * this entity set. A chain holding fewer pages auto-refills toward it (see
   * {@link advancePageChain}); a chain can hold fewer permanently only when
   * the result set ran out of pages.
   */
  readonly targetPageCount: number;
  readonly pages: readonly Page[];
}

/**
 * Arms the chain's cursor for the next page when it holds fewer pages than
 * the window asks for and the result set has more to give. Returns the same
 * chain object when there is nothing to do (window reached, no further page,
 * or the next page is already the active request).
 */
const refillWindow = <Identity, Page extends ChainPage<unknown>>(
  chain: PageChain<Identity, Page>,
): PageChain<Identity, Page> => {
  if (chain.pages.length >= chain.targetPageCount) {
    return chain;
  }

  const nextCursor = chain.pages.at(-1)?.nextCursor;

  if (nextCursor == null || chain.activeCursor === nextCursor) {
    return chain;
  }

  return { ...chain, activeCursor: nextCursor };
};

/**
 * The "Show more" transition: widen the window to one page beyond what the
 * chain currently holds, and arm the cursor for it. Idempotent for a given
 * chain state, so a double-click (or a click racing an in-flight refill)
 * requests one page, not two.
 */
export const growPageWindow = <Identity, Page extends ChainPage<unknown>>(
  chain: PageChain<Identity, Page>,
): PageChain<Identity, Page> =>
  refillWindow({
    ...chain,
    targetPageCount: Math.max(chain.targetPageCount, chain.pages.length + 1),
  });

interface AdvancePageChain<
  Identity,
  Response,
  Page extends ChainPage<Response>,
> {
  /** Builds the accumulated page for a newly-captured response. Only invoked when the chain actually advances. */
  readonly buildPage: (
    response: Response,
    forCursor: EntityQueryCursor | undefined,
  ) => Page;
  readonly chain: PageChain<Identity, Page> | null;
  readonly identity: Identity;
  /** The cursor the current request was issued with. */
  readonly requestedCursor: EntityQueryCursor | undefined;
  readonly response: Response | undefined;
  /** The current entity-set identity (see {@link PageChain.windowKey}). */
  readonly windowKey: string;
}

/**
 * Advances the chain with the latest response, returning the same chain
 * object when there is nothing to do (so callers can `Object.is`-guard their
 * state update).
 *
 * The caller guarantees that `response` (when defined) answers the request
 * described by (`identity`, `requestedCursor`); with Apollo, `data` always
 * corresponds to the current variables.
 */
export const advancePageChain = <
  Identity,
  Response,
  Page extends ChainPage<Response>,
>({
  buildPage,
  chain,
  identity,
  requestedCursor,
  response,
  windowKey,
}: AdvancePageChain<Identity, Response, Page>): PageChain<
  Identity,
  Page
> | null => {
  if (response === undefined) {
    return chain;
  }

  if (chain === null || chain.issuedFor !== identity) {
    // First response for a new set of inputs: replace whatever was shown.
    // The same entity set keeps its window (the refill below re-chases the
    // discarded depth); a different set starts back at one page.
    return refillWindow({
      issuedFor: identity,
      windowKey,
      activeCursor: requestedCursor,
      targetPageCount:
        chain !== null && chain.windowKey === windowKey
          ? chain.targetPageCount
          : 1,
      pages: [buildPage(response, requestedCursor)],
    });
  }

  if (chain.pages.some((page) => page.sourceResponse === response)) {
    return refillWindow(chain);
  }

  if (requestedCursor === undefined) {
    // The first page was re-delivered (refresh or cache update). Later pages
    // continued the previous result set, so they are dropped.
    return refillWindow({
      ...chain,
      activeCursor: undefined,
      pages: [buildPage(response, undefined)],
    });
  }

  const existingIndex = chain.pages.findIndex(
    (page) => page.forCursor === requestedCursor,
  );

  if (existingIndex !== -1) {
    // A previously-captured page was re-delivered with new content (e.g. a
    // refetch): replace it and drop the pages that continued the old version.
    return refillWindow({
      ...chain,
      pages: [
        ...chain.pages.slice(0, existingIndex),
        buildPage(response, requestedCursor),
      ],
    });
  }

  return refillWindow({
    ...chain,
    pages: [...chain.pages, buildPage(response, requestedCursor)],
  });
};
