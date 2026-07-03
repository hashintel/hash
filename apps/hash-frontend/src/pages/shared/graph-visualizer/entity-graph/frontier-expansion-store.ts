/**
 * Frontier-expansion state, held outside React and read through
 * `useSyncExternalStore` snapshots (see `use-frontier-expansion.ts`).
 *
 * Expansions are async fetch pipelines (id batches -> subgraph fetch -> worker
 * ingest) whose bookkeeping (what is expanded, what is in flight, what each
 * expansion revealed) must be readable both by React renders and by the
 * Scene's imperative resolvers between renders. A store gives both readers one
 * authority: React subscribes to immutable snapshots; imperative code reads
 * the latest snapshot directly.
 *
 * The store outlives any one worker: it is owned by the surface that owns the
 * entity query (the entities page, an entity slide) and keyed to the query's
 * identity, while workers come and go beneath it (view switches unmount the
 * visualizer; a `sourceKey` change recreates the worker). The worker is a
 * sink the store {@link FrontierExpansionStore.attach}es to: every committed
 * expansion is kept as an {@link ExpansionRecord}, and attaching a fresh
 * worker replays the records into it, so expansions survive leaving and
 * re-entering the graph view and can be shown outside it (the "OR n
 * entities" filter pill, expansion rows in the table).
 *
 * An expansion still in flight when its owner scope dies keeps fetching until
 * {@link FrontierExpansionStore.deactivate} stops it; a deactivated store
 * never mutates state again, so an orphaned generation cannot leak into the
 * fresh one that replaced it.
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

import type { WorkerHandle } from "../render/entity-worker-connection";
import type {
  IngestEntity,
  PropertySchemaEntry,
  TypeSchemaEntry,
} from "../worker/protocol";
import type { EntityId } from "@blockprotocol/type-system";
import type {
  HashEntity,
  SerializedSubgraph,
} from "@local/hash-graph-sdk/entity";
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

/**
 * One committed expansion batch: everything needed to (1) replay it into a
 * recreated worker byte-for-byte (the exact schema/ingest payloads originally
 * sent) and (2) present the expanded entities outside the graph (table rows,
 * resolved against the type maps and subgraph the batch arrived with).
 */
export interface ExpansionRecord {
  /** The frontier ids this batch expanded (they became roots in the worker). */
  readonly expandedIds: readonly EntityId[];
  /**
   * The expanded entities themselves (the fetched entities matching
   * {@link expandedIds}), which are the rows an expansion adds to the table.
   * The rest of the fetched neighbourhood (links, endpoint nodes) is the next
   * frontier, not an addition.
   */
  readonly expandedEntities: readonly HashEntity[];
  readonly rootMap: ClosedMultiEntityTypesRootMap | undefined;
  readonly definitions: ClosedMultiEntityTypesDefinitions | undefined;
  /** The batch response's subgraph, as table-row generation expects it. */
  readonly subgraph: SerializedSubgraph;
  readonly typeSchemas: readonly TypeSchemaEntry[];
  readonly propertySchemas: readonly PropertySchemaEntry[];
  /** The exact ingest payload sent to the worker (and re-sent on replay). */
  readonly ingestEntities: readonly IngestEntity[];
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
   * Freshly-fetched expansion nodes and links (absent from the prop `entities`) plus the type
   * maps their card resolves against. The root map is a nested per-type-chain structure, so each
   * node keeps its source map rather than deep-merging maps from every expansion.
   */
  readonly expandedById: ReadonlyMap<EntityId, EntityCardContext>;
  /** Committed expansion batches, in commit order (the replay + table-row log). */
  readonly records: readonly ExpansionRecord[];
  readonly progress: FrontierProgress;
  /**
   * User-facing message from the most recent expansion failure, cleared when the next
   * expansion starts. Partial progress survives the failure: batches fetched before it
   * remain expanded, and the unfetched ids return to the frontier for retry (see
   * {@link FrontierExpansionStore.expand}).
   */
  readonly error: string | undefined;
}

const emptyFrontierSnapshot: FrontierSnapshot = {
  expandedRoots: new Set(),
  inFlight: new Set(),
  expandedById: new Map(),
  records: [],
  progress: { done: 0, total: 0, fetching: false },
  error: undefined,
};

export class FrontierExpansionStore {
  /**
   * The worker connection currently receiving expansions, if any. The store
   * works without one: expansions keep committing to the record log, and the
   * next {@link attach} replays them. Never read across an await without
   * re-reading (a detach/attach can happen mid-expansion).
   */
  #handle: WorkerHandle | undefined;

  readonly #listeners = new Set<() => void>();

  #snapshot = emptyFrontierSnapshot;
  #active = true;
  /** In-flight {@link expand} calls; `progress.fetching` stays true until the last one settles. */
  #runningExpansions = 0;

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

  /**
   * Point the store at a (new) worker connection and replay every committed
   * expansion into it. The worker's ingest is additive and idempotent per
   * entity (a re-sent entity re-asserts root-ness, never duplicates), so
   * replay after the base re-ingest converges to the same graph the previous
   * worker held.
   */
  attach(handle: WorkerHandle): void {
    this.#handle = handle;

    for (const record of this.#snapshot.records) {
      handle.registerTypes(record.typeSchemas, record.propertySchemas);
      handle.ingestBatch(record.ingestEntities);
    }
  }

  /** Stop feeding the current worker (it is being torn down); state is kept. */
  detach(): void {
    this.#handle = undefined;
  }

  /** Re-arm after {@link deactivate} (an effect setup/cleanup pair toggles these). */
  activate(): void {
    this.#active = true;
  }

  /**
   * Stop in-flight expansions from fetching further batches and mutating
   * state. Called when the owning scope goes away and leaves this instance
   * orphaned: the store's reset key changed (new filter set, cleared
   * additions) or its owner unmounted.
   */
  deactivate(): void {
    this.#active = false;
  }

  /**
   * Expand frontier nodes: fetch their neighbourhoods in batches, commit each
   * batch to the record log, and hand it to the attached worker (if any),
   * whose additive ingest is the merge. Each expanded node flips to a root
   * and un-greys; its endpoints become the next frontier. Ids already
   * expanded or in flight are skipped, so each id expands at most once and
   * repeat calls are no-ops.
   *
   * Batches commit independently, and a fetch failure mid-run rolls nothing back: the
   * worker cannot retract batches it already merged. Ids ingested before the failure
   * stay expanded, while the unfetched ids leave `inFlight` without joining
   * `expandedRoots`, so they count as frontier again and a repeat call fetches only that
   * remainder. The failure message is published as {@link FrontierSnapshot.error} and
   * clears when the next expansion starts. Failures never reject the returned promise
   * (they surface only through the snapshot), so callers can fire-and-forget.
   */
  readonly expand = async (entityIds: readonly EntityId[]): Promise<void> => {
    if (!this.#isActive()) {
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

        const batchIdSet = new Set(batch);
        const record: ExpansionRecord = {
          expandedIds: batch,
          expandedEntities: expansion.entities.filter((entity) =>
            batchIdSet.has(entity.metadata.recordId.entityId),
          ),
          rootMap: expansion.closedMultiEntityTypes,
          definitions: expansion.definitions,
          subgraph: expansion.subgraph,
          typeSchemas: extractTypeSchemas(
            expansion.entities,
            expansion.closedMultiEntityTypes,
            expansion.definitions,
          ),
          propertySchemas: extractPropertySchemas(expansion.definitions),
          ingestEntities: toIngestEntities(expansion.entities, batchIdSet),
        };

        // Feed the live worker, if one is attached; otherwise the record
        // alone carries the batch until the next attach replays it.
        this.#handle?.registerTypes(record.typeSchemas, record.propertySchemas);
        this.#handle?.ingestBatch(record.ingestEntities);

        const expandedRoots = new Set(this.#snapshot.expandedRoots);
        for (const entityId of batch) {
          expandedRoots.add(entityId);
        }

        // Keep the fetched entities and the maps their card resolves against, for hover/selection
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
          records: [...this.#snapshot.records, record],
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
