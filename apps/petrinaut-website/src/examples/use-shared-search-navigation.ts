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
 */
const mergeSharedSearch = (
  current: PetrinautNavigationState,
  search: SharedExampleSearch,
): PetrinautNavigationState => {
  const shared = sharedSearchToNavigationState(search);
  return {
    ...current,
    scenarioId: shared.scenarioId,
    subnetId: shared.subnetId,
    selection: shared.selection,
  };
};

/**
 * Navigation controller for pages whose URL carries the shared
 * scenario/subnet/selection subset. The editor navigates more than that
 * (global mode, overlays), so the full location lives in page state and only
 * its shared projection is mirrored to the URL — otherwise every control
 * driving a non-shared field would silently snap back.
 *
 * `initialState` seeds the fields the URL does not carry. A controlled host
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
  const [navigationState, setNavigationState] =
    useState<PetrinautNavigationState>(() =>
      // The URL wins over the seed for the fields it owns, so a shared link
      // still resolves to the location it names.
      mergeSharedSearch(
        { ...defaultPetrinautNavigationState, ...options?.initialState },
        search,
      ),
    );

  // Merge external URL changes (Back/Forward, a normalization redirect)
  // into the in-memory location during render.
  const [previousSearch, setPreviousSearch] = useState(search);
  if (!sharedSearchesMatch(search, previousSearch)) {
    setPreviousSearch(search);
    setNavigationState((current) => mergeSharedSearch(current, search));
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

      const nextSearch = navigationStateToSharedSearch(next);
      if (!sharedSearchesMatch(nextSearch, latestSearchRef.current)) {
        latestSearchRef.current = nextSearch;
        onSearchChange(nextSearch, history);
      }
    },
  };
};
