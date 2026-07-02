/**
 * Frontier-expansion state, held OUTSIDE React and read through
 * `useSyncExternalStore` snapshots (see `use-frontier-expansion.ts`).
 *
 * Expansions are async fetch pipelines (id batches -> subgraph fetch -> worker
 * ingest) whose bookkeeping — what's expanded, what's in flight, what each
 * expansion revealed — must be readable both by React renders and by the
 * Scene's imperative resolvers between renders. A store gives both readers one
 * authority: React subscribes to immutable snapshots; imperative code reads
 * the latest snapshot directly.
 *
 * One store per worker connection: a `sourceKey` change recreates the worker
 * AND the store, so an expansion still in flight at teardown continues against
 * its orphaned store + terminated worker (posts to it are dropped) and cannot
 * leak into the fresh generation. {@link FrontierExpansionStore.deactivate}
 * additionally stops the orphan from fetching further batches.
 */

import { useSyncExternalStore } from "react";

import { fetchFrontierExpansion } from "../fetch-frontier-expansion";
import {
  freshFrontierIds,
  frontierExpansionBatches,
} from "../interactivity/frontier-expansion";
import {
  extractPropertySchemas,
  extractTypeSchemas,
  toIngestEntities,
} from "./ingest-mapping";

import type { WorkerHandle } from "../render/worker-connection";
import type { EntityId } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-sdk/ontology";

/**
 * A hovered/selected entity's data plus the type maps its card needs. For a freshly-expanded node
 * (not in the prop `entities`) this is the expansion it arrived in, since the prop maps don't cover
 * it; for a prop entity it is just the prop maps.
 */
export interface EntityCardContext {
  readonly entity: HashEntity;
  readonly rootMap: ClosedMultiEntityTypesRootMap | undefined;
  readonly definitions: ClosedMultiEntityTypesDefinitions | undefined;
}

export interface FrontierProgress {
  readonly done: number;
  readonly total: number;
  readonly fetching: boolean;
}

export interface FrontierSnapshot {
  /**
   * Frontier nodes the user has already expanded. Tracked locally because the worker learns
   * their root-ness via ingest, but the bridge's prop-derived root set never does.
   */
  readonly expandedRoots: ReadonlySet<EntityId>;
  readonly inFlight: ReadonlySet<EntityId>;
  /**
   * Freshly-fetched expansion nodes + links (NOT in the prop `entities`) + the type maps their
   * card resolves against. The root map is a nested per-type-chain structure, so each node keeps
   * its source map rather than deep-merging maps from every expansion.
   */
  readonly expandedById: ReadonlyMap<EntityId, EntityCardContext>;
  readonly progress: FrontierProgress;
  readonly error: string | undefined;
}

const emptyFrontierSnapshot: FrontierSnapshot = {
  expandedRoots: new Set(),
  inFlight: new Set(),
  expandedById: new Map(),
  progress: { done: 0, total: 0, fetching: false },
  error: undefined,
};

export class FrontierExpansionStore {
  /**
   * The worker connection this store's expansions feed. Public so the React binding can
   * detect a recreated worker and swap in a fresh store (see `use-frontier-expansion.ts`).
   * Undefined while the worker hasn't been created yet; the store is then inert.
   */
  readonly handle: WorkerHandle | undefined;

  readonly #listeners = new Set<() => void>();

  #snapshot = emptyFrontierSnapshot;
  #active = true;
  /** In-flight {@link expand} calls; `progress.fetching` stays true until the last one settles. */
  #runningExpansions = 0;

  constructor(handle: WorkerHandle | undefined) {
    this.handle = handle;
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);

    return () => {
      this.#listeners.delete(listener);
    };
  };

  /**
   * The current snapshot. Immutable: every mutation publishes a fresh snapshot (with fresh
   * collections for the parts that changed), so it is safe both as a `useSyncExternalStore`
   * source and as a memo dependency.
   */
  readonly getSnapshot = (): FrontierSnapshot => this.#snapshot;

  /** Re-arm after {@link deactivate} (an effect setup/cleanup pair toggles these). */
  activate(): void {
    this.#active = true;
  }

  /**
   * Stop in-flight expansions from fetching further batches and mutating state. Called when
   * the owning component unmounts or the worker is recreated (the store is then orphaned).
   */
  deactivate(): void {
    this.#active = false;
  }

  /**
   * Expand frontier nodes: fetch their neighbourhoods and hand them to the worker, whose
   * additive ingest is the merge -- each expanded node flips to a root and un-greys; its
   * endpoints become the next frontier. Ids already expanded or in flight are skipped, so
   * each id expands at most once and repeat calls are no-ops.
   */
  readonly expand = async (entityIds: readonly EntityId[]): Promise<void> => {
    const { handle } = this;
    if (!handle || !this.#isActive()) {
      return;
    }

    const fresh = freshFrontierIds(
      entityIds,
      this.#snapshot.expandedRoots,
      this.#snapshot.inFlight,
    );
    if (fresh.length === 0) {
      return;
    }

    this.#runningExpansions += 1;
    this.#publish({
      inFlight: new Set([...this.#snapshot.inFlight, ...fresh]),
      error: undefined,
      progress: { done: 0, total: fresh.length, fetching: true },
    });

    let done = 0;
    try {
      for (const batch of frontierExpansionBatches(fresh)) {
        const expansion = await fetchFrontierExpansion(batch);
        if (!this.#isActive()) {
          return;
        }

        if (!expansion) {
          throw new Error("Frontier expansion returned no data.");
        }

        handle.registerTypes(
          extractTypeSchemas(
            expansion.entities,
            expansion.closedMultiEntityTypes,
            expansion.definitions,
          ),
          extractPropertySchemas(expansion.definitions),
        );
        handle.ingestBatch(
          toIngestEntities(expansion.entities, new Set(batch)),
        );

        const expandedRoots = new Set(this.#snapshot.expandedRoots);
        for (const entityId of batch) {
          expandedRoots.add(entityId);
        }

        // Keep the fetched entities + the maps their card resolves against, for hover/selection
        // on nodes this expansion revealed (they are not in the prop `entities`).
        const expandedById = new Map(this.#snapshot.expandedById);
        for (const entity of expansion.entities) {
          expandedById.set(entity.metadata.recordId.entityId, {
            entity,
            rootMap: expansion.closedMultiEntityTypes,
            definitions: expansion.definitions,
          });
        }

        done += batch.length;
        this.#publish({
          expandedRoots,
          expandedById,
          progress: { done, total: fresh.length, fetching: true },
        });
      }
    } catch (fetchError) {
      if (this.#isActive()) {
        this.#publish({
          error:
            fetchError instanceof Error
              ? fetchError.message
              : "Could not fetch the frontier.",
        });
      }
    } finally {
      this.#runningExpansions -= 1;
      if (this.#isActive()) {
        const inFlight = new Set(this.#snapshot.inFlight);
        for (const entityId of fresh) {
          inFlight.delete(entityId);
        }

        this.#publish({
          inFlight,
          progress: {
            ...this.#snapshot.progress,
            fetching: this.#runningExpansions > 0,
          },
        });
      }
    }
  };

  /**
   * As a method (not a field read) so the lint's control-flow narrowing doesn't flag the
   * re-checks after each await: `deactivate()` flips the field concurrently mid-expansion.
   */
  #isActive(): boolean {
    return this.#active;
  }

  #publish(partial: Partial<FrontierSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...partial };

    for (const listener of this.#listeners) {
      listener();
    }
  }
}

export const useFrontierExpansionStore = (store: FrontierExpansionStore) =>
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

/**
 * The not-yet-expanded frontier across both entity sources (the props and prior expansions):
 * every non-link entity that is neither a query root nor already expanded nor in flight.
 */
export function collectFrontierEntityIds(
  entities: readonly HashEntity[] | undefined,
  rootIdSet: ReadonlySet<EntityId> | undefined,
  frontierState: Pick<
    FrontierSnapshot,
    "expandedRoots" | "inFlight" | "expandedById"
  >,
): EntityId[] {
  if (!rootIdSet) {
    return [];
  }

  const frontier = new Set<EntityId>();
  const addIfFrontier = (entity: HashEntity): void => {
    const entityId = entity.metadata.recordId.entityId;
    if (
      !entity.linkData &&
      !rootIdSet.has(entityId) &&
      !frontierState.expandedRoots.has(entityId) &&
      !frontierState.inFlight.has(entityId)
    ) {
      frontier.add(entityId);
    }
  };

  for (const entity of entities ?? []) {
    addIfFrontier(entity);
  }

  for (const context of frontierState.expandedById.values()) {
    addIfFrontier(context.entity);
  }

  return [...frontier];
}
