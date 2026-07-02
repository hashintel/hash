/**
 * React binding for {@link FrontierExpansionStore}: one store per worker
 * connection, subscribed via `useSyncExternalStore`, plus the derived
 * not-yet-expanded frontier id list.
 */
import { useEffect, useMemo, useState } from "react";

import {
  collectFrontierEntityIds,
  FrontierExpansionStore,
  useFrontierExpansionStore,
} from "./frontier-expansion-store";

import type { WorkerHandle } from "../render/worker-connection";
import type { FrontierSnapshot } from "./frontier-expansion-store";
import type { EntityId } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

interface UseFrontierExpansionOptions {
  readonly handle: WorkerHandle | undefined;
  readonly entities: readonly HashEntity[] | undefined;
  readonly rootIdSet: ReadonlySet<EntityId> | undefined;
}

interface UseFrontierExpansionResult {
  /**
   * Stable per worker connection. Imperative consumers (the Scene's resolvers, click
   * handlers) call `store.expand` / read `store.getSnapshot()` for the latest state
   * without needing a render in between.
   */
  readonly store: FrontierExpansionStore;
  readonly snapshot: FrontierSnapshot;
  /** Every loaded entity that is still frontier: not a root, not expanded, not in flight. */
  readonly frontierEntityIds: readonly EntityId[];
}

export function useFrontierExpansion({
  handle,
  entities,
  rootIdSet,
}: UseFrontierExpansionOptions): UseFrontierExpansionResult {
  const [store, setStore] = useState(() => new FrontierExpansionStore(handle));

  // A recreated worker (sourceKey change) gets a fresh store: the old worker's expansions
  // are torn down with it, so every local mirror of its state resets too. State-adjust
  // during render (not an effect) so no frame ever pairs the new worker with stale state.
  if (store.handle !== handle) {
    setStore(new FrontierExpansionStore(handle));
  }

  // Deactivation stops an orphaned store's in-flight expansion from fetching further
  // batches (its results would feed a terminated worker).
  useEffect(() => {
    store.activate();

    return () => {
      store.deactivate();
    };
  }, [store]);

  const snapshot = useFrontierExpansionStore(store);
  const { expandedRoots, inFlight, expandedById } = snapshot;

  const frontierEntityIds = useMemo(
    () =>
      collectFrontierEntityIds(entities, rootIdSet, {
        expandedRoots,
        inFlight,
        expandedById,
      }),
    [entities, rootIdSet, expandedRoots, inFlight, expandedById],
  );

  return { store, snapshot, frontierEntityIds };
}
