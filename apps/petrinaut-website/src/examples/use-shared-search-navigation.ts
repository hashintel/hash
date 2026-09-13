import { useLayoutEffect, useRef, useState } from "react";

import { defaultPetrinautNavigationState } from "@hashintel/petrinaut/react";

import {
  sharedSearchesMatch,
  type SharedExampleSearch,
} from "./example-search";
import {
  navigationStateToSharedSearch,
  sharedSearchToNavigationState,
} from "./navigation-search";

import type {
  PetrinautNavigationController,
  PetrinautNavigationHistoryPolicy,
  PetrinautNavigationState,
} from "@hashintel/petrinaut/react";

/**
 * Overwrites the URL-owned fields of the in-memory location with the current
 * shared search, keeping the fields the URL cannot represent.
 *
 * A field the search omits resolves to the page's baseline, so Back onto an
 * entry that does not name it returns to where the page started.
 */
const mergeSharedSearch = (
  current: PetrinautNavigationState,
  search: SharedExampleSearch,
  baseline: PetrinautNavigationState,
): PetrinautNavigationState => {
  const shared = sharedSearchToNavigationState(search, baseline);
  return {
    ...current,
    scenarioId: shared.scenarioId,
    subnetId: shared.subnetId,
    selection: shared.selection,
    mode: shared.mode,
    simulateView: shared.simulateView,
    overlay: shared.overlay,
  };
};

/**
 * The URL-owned fields, cleared, for a host whose document is being replaced.
 *
 * Writing an empty search is not enough on its own: the shared projection is
 * lossy, so a location the URL already renders as empty — a multi-item
 * selection, for one — leaves the `search` prop unchanged, the merge below
 * never runs, and the in-memory selection survives into the next document.
 * Passing this to `onNavigate` clears the location itself and lets the write
 * to the URL fall out of the usual path.
 */
export const withClearedSharedLocation = (
  current: PetrinautNavigationState,
): PetrinautNavigationState => ({
  ...current,
  scenarioId: undefined,
  subnetId: null,
  selection: [],
});

/**
 * Navigation controller for pages whose URL carries the shared location: the
 * scenario, the subnet, the focused item, the mode, the Simulate section and
 * the open overlay. The editor navigates one field more than that — the
 * resource open inside Simulate — so the full location still lives in page
 * state and only its shared projection reaches the URL.
 *
 * `initialState` is the location this page starts from, for every field the URL
 * does not name; the URL overrides whatever it does name. A controlled host
 * replaces `PetrinautNavigationProvider`'s own initial state, including the
 * Actual-mode default it applies when a live stream is available, so a page
 * that opens in a non-default mode states that mode here.
 */
export const useSharedSearchNavigation = (
  search: SharedExampleSearch,
  onSearchChange: (
    search: SharedExampleSearch,
    history: "push" | "replace",
  ) => void,
  options?: {
    historyPolicy?: PetrinautNavigationHistoryPolicy;
    initialState?: Partial<PetrinautNavigationState>;
  },
): PetrinautNavigationController => {
  // Snapshotted once: the caller passes a fresh object literal every render,
  // and this is the value every absent URL field resolves to for the life of
  // the page.
  const [baseline] = useState<PetrinautNavigationState>(() => ({
    ...defaultPetrinautNavigationState,
    ...options?.initialState,
  }));

  const [navigationState, setNavigationState] =
    useState<PetrinautNavigationState>(() =>
      // The URL wins over the baseline for the fields it names, so a shared
      // link still resolves to the location it carries.
      mergeSharedSearch(baseline, search, baseline),
    );

  // Merge external URL changes (Back/Forward, a normalization redirect)
  // into the in-memory location during render. The hook's own write is
  // suppressed once, when the router delivers it back: the in-memory location
  // already holds it, and the shared projection cannot represent all of it.
  const [previousSearch, setPreviousSearch] = useState(search);
  const [writtenSearch, setWrittenSearch] =
    useState<SharedExampleSearch | null>(null);
  if (!sharedSearchesMatch(search, previousSearch)) {
    const isOwnWrite =
      writtenSearch !== null && sharedSearchesMatch(search, writtenSearch);
    setPreviousSearch(search);
    // Cleared either way, so a later Back or Forward onto the same location
    // still merges rather than being mistaken for the same echo again.
    setWrittenSearch(null);
    if (!isOwnWrite) {
      setNavigationState((current) =>
        mergeSharedSearch(current, search, baseline),
      );
    }
  }

  // Freshest committed location for callbacks that can fire several times
  // within one browser event, before React rerenders. Re-synced on every
  // commit: this state always holds the applied value.
  const navigationStateRef = useRef(navigationState);
  useLayoutEffect(() => {
    navigationStateRef.current = navigationState;
  });

  // The search this page last received from the router OR last sent to it.
  // Synced only when the router delivers a new search — an unconditional
  // resync would overwrite an in-flight write with the not-yet-committed
  // prop and make the next identical navigation skip its URL write.
  const latestSearchRef = useRef(search);
  useLayoutEffect(() => {
    latestSearchRef.current = search;
  }, [search]);

  return {
    state: navigationState,
    historyPolicy: options?.historyPolicy,
    onNavigate: (update, { history }) => {
      const next = update(navigationStateRef.current);
      navigationStateRef.current = next;
      setNavigationState(next);

      const nextSearch = navigationStateToSharedSearch(next, baseline);
      if (!sharedSearchesMatch(nextSearch, latestSearchRef.current)) {
        latestSearchRef.current = nextSearch;
        // The router delivers this write back as a new `search` prop, and the
        // merge above must not treat that echo as an external change: the
        // projection is lossy, so re-merging it would clear a selection of
        // any size but one.
        setWrittenSearch(nextSearch);
        onSearchChange(nextSearch, history);
      }
    },
  };
};
