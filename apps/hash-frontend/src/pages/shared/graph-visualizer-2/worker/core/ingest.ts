import { Column } from "../collections/column";
import { ReadonlySortedSet } from "../collections/readonly-sorted-set";

import type { EntityIndex, TypeSetKey } from "../../ids";
import type { IngestDelta } from "../hierarchy/cluster-tree";
import type {
  IngestEntity,
  PropertySchemaEntry,
  TypeSchemaEntry,
} from "../protocol";
import type { EntityStore } from "../store/entity";
import type { LinkStore } from "../store/link";
import type { PropertyStore } from "../store/property";
import type { TypeRegistry } from "../store/type-registry";
import type { TypeSetGroup, TypeSetStore } from "../store/type-set";
import type { EntityId } from "@blockprotocol/type-system";

/** Initial capacity for the node-index column (grows by doubling). */
const NODE_IDX_CAPACITY = 4096;

export interface IngestStores {
  readonly entities: EntityStore;
  readonly links: LinkStore;
  readonly properties: PropertyStore;
  readonly types: TypeRegistry;
  readonly typeSets: TypeSetStore;
}

/**
 * Writes ingested entities and links into the stores, tracking the node set
 * (link entities are interned but are not nodes) and pending-link resolution.
 *
 * This is the only writer of the stores; every other collaborator reads them.
 */
export class IngestController {
  readonly #stores: IngestStores;

  /** Loaded node entities (excludes interned links). */
  #nodeEntityCount = 0;

  /**
   * Node entity indices, always sorted ascending. Interner indices are
   * monotonic, so appending on insert preserves the sort invariant.
   */
  readonly #nodeEntityIdxs = new Column<Int32Array, EntityIndex>(
    Int32Array,
    NODE_IDX_CAPACITY,
  );

  /** Set when an expand flips a rendered frontier node to a root; triggers a restyle. */
  #rootFlipPending = false;

  constructor(stores: IngestStores) {
    this.#stores = stores;
  }

  /** Node entity count (excludes link entities interned by the EntityStore). */
  get nodeCount(): number {
    return this.#nodeEntityCount;
  }

  get rootFlipPending(): boolean {
    return this.#rootFlipPending;
  }

  /** Consume the pending root-flip signal. Returns whether one was pending. */
  consumeRootFlip(): boolean {
    const pending = this.#rootFlipPending;
    this.#rootFlipPending = false;
    return pending;
  }

  /** Materialise the packed node-index column into a plain array. */
  snapshotNodeEntityIdxs(): EntityIndex[] {
    return [...this.#nodeEntityIdxs];
  }

  /**
   * Register type and property schemas. Returns what changed so the caller
   * can decide whether a commit is needed.
   */
  registerTypes(
    schemas: readonly TypeSchemaEntry[],
    propertySchemas: readonly PropertySchemaEntry[],
  ): {
    readonly typesChanged: boolean;
    readonly propertyTitlesChanged: boolean;
  } {
    const typesChanged = this.#stores.types.registerAll(schemas);
    const propertyTitlesChanged =
      this.#stores.properties.registerTitles(propertySchemas);

    return { typesChanged, propertyTitlesChanged };
  }

  /**
   * Insert a node entity. Returns undefined if duplicate.
   *
   * `knownGroup` skips re-resolving the type-set group when the caller has
   * already peeked it for this entity (see {@link ingestBatch}); it must be
   * the group {@link #peekGroup} returned for the same entity.
   */
  insertNodeEntity(
    entity: IngestEntity,
    knownGroup?: TypeSetGroup,
  ): { entityIdx: EntityIndex; groupKey: TypeSetKey } | undefined {
    const { entities, types, typeSets, properties } = this.#stores;
    const [created, entityIdx] = entities.insert(entity.entityId);

    // Apply root-ness even for an already-interned entity: an expand re-sends a frontier node as a
    // root, and this is what flips it. A flip of an already-rendered node needs a restyle the
    // commit alone won't do in the hierarchical tier (see GraphWorker.restyleIfRootsFlipped).
    if (entity.isRoot) {
      const flippedExisting = entities.insertRoot(entityIdx) && !created;
      if (flippedExisting) {
        this.#rootFlipPending = true;
      }
    }

    if (!created) {
      return;
    }

    this.#nodeEntityCount += 1;
    // Interner indices are monotonic, so this stays sorted (see #nodeEntityIdxs).
    this.#nodeEntityIdxs.push(entityIdx);

    const group =
      knownGroup ??
      typeSets.getOrCreate(
        new ReadonlySortedSet(
          entity.entityTypeIds.map((url) => types.intern(url)),
          (lhs, rhs) => lhs - rhs,
        ),
        types.size,
      );

    group.addEntity(entityIdx);
    entities.setTypeSet(entityIdx, group.id);
    // Reduce the entity's properties to its interned features now, while ingesting, so a
    // later cluster-naming pass just tallies integers (see {@link PropertyStore}).
    properties.ingest(entityIdx, entity.properties);
    this.#resolvePendingLinks(entity.entityId, entityIdx);

    return { entityIdx, groupKey: group.key };
  }

  insertLinkEntity(entity: IngestEntity): void {
    if (!entity.linkData) {
      return;
    }

    const { entities, links, types, typeSets } = this.#stores;
    const [created, linkEntityIdx] = entities.insert(entity.entityId);
    if (!created) {
      return;
    }

    const leftIdx = entities.lookup(entity.linkData.leftEntityId) ?? -1;
    const rightIdx = entities.lookup(entity.linkData.rightEntityId) ?? -1;

    const linkTypeIdxs = new ReadonlySortedSet(
      entity.entityTypeIds.map((url) => types.intern(url)),
      (lhs, rhs) => lhs - rhs,
    );
    const linkGroup = typeSets.getOrCreate(linkTypeIdxs, types.size);

    const linkId = links.insert(leftIdx, rightIdx, linkGroup.id, linkEntityIdx);

    if (leftIdx === -1) {
      links.addPending(entity.linkData.leftEntityId, linkId, "left");
    }
    if (rightIdx === -1) {
      links.addPending(entity.linkData.rightEntityId, linkId, "right");
    }
  }

  /**
   * Ingest a batch of entities, returning per-group deltas
   * for the incremental update path.
   */
  ingestBatch(entities: readonly IngestEntity[]): IngestDelta[] {
    const groupSnapshots = new Map<
      TypeSetKey,
      { before: number; isNew: boolean }
    >();
    const links: IngestEntity[] = [];

    for (const entity of entities) {
      if (entity.isLink) {
        links.push(entity);
        continue;
      }

      // Snapshot count before insert so we can compute deltas. The peeked
      // group is handed to the insert, which skips re-resolving it.
      const group = this.#peekGroup(entity);
      if (group && !groupSnapshots.has(group.key)) {
        groupSnapshots.set(group.key, {
          before: group.count,
          isNew: group.count === 0,
        });
      }

      this.insertNodeEntity(entity, group);
    }

    for (const entity of links) {
      this.insertLinkEntity(entity);
    }

    const deltas: IngestDelta[] = [];
    for (const [groupKey, { before, isNew }] of groupSnapshots) {
      const group = this.#stores.typeSets.get(groupKey)!;
      const delta = group.count - before;
      if (delta > 0) {
        deltas.push({
          groupKey,
          delta,
          isNewGroup: isNew,
          previousCount: before,
        });
      }
    }

    return deltas;
  }

  /** Peek at which group an entity would land in without inserting. */
  #peekGroup(entity: IngestEntity): TypeSetGroup | undefined {
    const { entities, types, typeSets } = this.#stores;
    if (entities.lookup(entity.entityId) !== undefined) {
      return undefined; // Already inserted, skip.
    }

    const directTypeIdxs = new ReadonlySortedSet(
      entity.entityTypeIds.map((url) => types.intern(url)),
      (lhs, rhs) => lhs - rhs,
    );

    return typeSets.getOrCreate(directTypeIdxs, types.size);
  }

  #resolvePendingLinks(entityId: EntityId, entityIdx: EntityIndex): void {
    const pending = this.#stores.links.takePending(entityId);
    if (!pending) {
      return;
    }

    // Each pending record names the exact side that referenced this entity.
    // Resolving both sides here would rewrite the already-known endpoint to
    // this entity, corrupting the link into a self-loop (A->B becoming B->B).
    for (const { linkId, side } of pending) {
      this.#stores.links.resolveEndpoint(linkId, side, entityIdx);
    }
  }
}
