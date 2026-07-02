/**
 * React bindings for {@link FrontierExpansionStore}.
 *
 * Ownership is split in two:
 *
 * - {@link useOwnedFrontierStore} runs where the entity QUERY lives (the
 *   entities page, an entity slide, the dev harness): it creates the store,
 *   resets it when the query identity changes, and deactivates it on
 *   unmount. Owning it above the visualizer is what lets expansions survive
 *   view switches and surface outside the graph (filter pill, table rows).
 * - {@link useFrontierExpansion} runs inside the visualizer: it attaches the
 *   store to the current worker connection (replaying committed expansions
 *   into a recreated worker), subscribes to snapshots, and derives the
 *   not-yet-expanded frontier id list.
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

/**
 * Create and own a {@link FrontierExpansionStore} scoped to `resetKey` (the
 * identity of the entity set expansions extend — a filter change or an
 * explicit "clear additions" flips it). A key change swaps in a fresh store,
 * deactivating the orphan so its in-flight expansions stop; every local
 * mirror of the old generation resets with it.
 */
export function useOwnedFrontierStore(
  resetKey: string | undefined,
): FrontierExpansionStore {
  const [entry, setEntry] = useState(() => ({
    key: resetKey,
    store: new FrontierExpansionStore(),
  }));

  // State-adjust during render (not an effect) so no frame ever pairs the new
  // key's UI with the old generation's expansions.
  if (entry.key !== resetKey) {
    setEntry({ key: resetKey, store: new FrontierExpansionStore() });
  }

  useEffect(() => {
    entry.store.activate();

    return () => {
      entry.store.deactivate();
    };
  }, [entry.store]);

  return entry.store;
}

interface UseFrontierExpansionOptions {
  /** The owner-scoped store (see {@link useOwnedFrontierStore}). */
  readonly store: FrontierExpansionStore;
  readonly handle: WorkerHandle | undefined;
  readonly entities: readonly HashEntity[] | undefined;
  readonly rootIdSet: ReadonlySet<EntityId> | undefined;
}

interface UseFrontierExpansionResult {
  readonly snapshot: FrontierSnapshot;
  /** Every loaded entity that is still frontier: not a root, not expanded, not in flight. */
  readonly frontierEntityIds: readonly EntityId[];
}

export function useFrontierExpansion({
  store,
  handle,
  entities,
  rootIdSet,
}: UseFrontierExpansionOptions): UseFrontierExpansionResult {
  // Bind the store to the live worker. A recreated worker (sourceKey change,
  // including a cleared-additions epoch bump) attaches fresh and receives the
  // record replay; posting stops the moment the old worker is torn down.
  useEffect(() => {
    if (!handle) {
      return;
    }

    store.attach(handle);

    return () => {
      store.detach();
    };
  }, [store, handle]);

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

  return { snapshot, frontierEntityIds };
}
