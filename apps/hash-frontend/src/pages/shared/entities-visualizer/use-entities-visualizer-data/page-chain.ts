/**
 * Pure state transitions for the visualizer's accumulated result pages.
 *
 * A {@link PageChain} is the ordered list of response pages fetched for one
 * specific set of query inputs (the `issuedFor` identity), plus the cursor
 * currently applied to the query. The chain is advanced during render via
 * {@link advancePageChain} whenever a response is available, which keeps the
 * accumulated pages a pure function of (previous chain, current inputs,
 * current response) -- there is no effect or completion callback involved.
 *
 * Invariants:
 * - `pages[0]` was requested without a cursor (the first page); every later
 *   page was requested with the cursor of the page before it.
 * - A response object is captured at most once (compared by identity).
 * - A re-delivered first page (refresh, cache update) discards all later
 *   pages, since they continued a result set that no longer exists.
 */
import type { EntityQueryCursor } from "@local/hash-graph-client";

export type ChainPage<Response> = {
  /**
   * The exact response object this page was built from. Compared by identity
   * to recognize a response that has already been captured.
   */
  sourceResponse: Response;
  /** The cursor this page was requested with; `undefined` for the first page. */
  forCursor: EntityQueryCursor | undefined;
};

export type PageChain<Identity, Page> = {
  /**
   * The query inputs these pages belong to, compared by identity. A chain
   * whose `issuedFor` is not the current identity is stale: it may still be
   * displayed while the first page for the new inputs loads, but its cursor
   * must not be applied to the query.
   */
  issuedFor: Identity;
  /** The cursor applied to the in-flight or most recent request; `undefined` requests the first page. */
  activeCursor: EntityQueryCursor | undefined;
  pages: Page[];
};

/**
 * Advances the chain with the latest response, returning the SAME chain
 * object when there is nothing to do (so callers can `Object.is`-guard their
 * state update).
 *
 * The caller guarantees that `response` (when defined) answers the request
 * described by (`identity`, `requestedCursor`) -- with Apollo, `data` always
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
}: {
  /** Builds the accumulated page for a newly-captured response. Only invoked when the chain actually advances. */
  buildPage: (
    response: Response,
    forCursor: EntityQueryCursor | undefined,
  ) => Page;
  chain: PageChain<Identity, Page> | null;
  identity: Identity;
  /** The cursor the current request was issued with. */
  requestedCursor: EntityQueryCursor | undefined;
  response: Response | undefined;
}): PageChain<Identity, Page> | null => {
  if (response === undefined) {
    return chain;
  }

  if (chain === null || chain.issuedFor !== identity) {
    // First response for a new set of inputs: replace whatever was shown.
    return {
      issuedFor: identity,
      activeCursor: requestedCursor,
      pages: [buildPage(response, requestedCursor)],
    };
  }

  if (chain.pages.some((page) => page.sourceResponse === response)) {
    return chain;
  }

  if (requestedCursor === undefined) {
    // The first page was re-delivered (refresh or cache update). Later pages
    // continued the previous result set, so they are dropped.
    return {
      ...chain,
      activeCursor: undefined,
      pages: [buildPage(response, undefined)],
    };
  }

  const existingIndex = chain.pages.findIndex(
    (page) => page.forCursor === requestedCursor,
  );

  if (existingIndex !== -1) {
    // A previously-captured page was re-delivered with new content (e.g. a
    // refetch): replace it and drop the pages that continued the old version.
    return {
      ...chain,
      pages: [
        ...chain.pages.slice(0, existingIndex),
        buildPage(response, requestedCursor),
      ],
    };
  }

  return {
    ...chain,
    pages: [...chain.pages, buildPage(response, requestedCursor)],
  };
};
