import { EntityIdBuffer } from "../buffers/entity-id-buffer";
import { BitSet } from "../collections/bitset";
import { Column } from "../collections/column";
import { Interner } from "../collections/interner";

import type { EntityIdx, TypeSetIdx } from "../../ids";
import type { RepublishHandler } from "../buffers/growable-buffer";
import type { EntityId } from "@blockprotocol/type-system";

/** Starting slot count for the columns + the EntityId map (all grow geometrically). */
const INITIAL_CAPACITY = 4096;

/**
 * Owns entity ID interning and per-entity columnar storage.
 *
 * Column indices are kept in sync with the interner: each new
 * entity gets a push on every column, so EntityIdx works as the
 * index into all of them. The {@link EntityIdBuffer} join map is just one more such
 * column, written the instant an EntityIdx is assigned, so it is always current with the
 * interner (no separate mirror/sync pass).
 */
export class EntityStore {
  readonly #interner: Interner<EntityId, EntityIdx> = new Interner();
  readonly #typeGroupIdx: Column<Uint32Array, TypeSetIdx | -1> = new Column(
    Uint32Array,
    INITIAL_CAPACITY,
  );

  readonly #labelIdx: Column<Int32Array> = new Column(Int32Array, 4096);

  /**
   * Query ROOTS as one bit per {@link EntityIdx} (1 bit/entity, auto-growing). A set bit means the
   * entity came back as a root of the current query; a clear bit means it is a FRONTIER node -- a
   * fetched link endpoint that is not itself a root, rendered greyed-out until expanded. Add-only
   * within a worker's life (roots only grow as the frontier expands; a fresh query rebuilds the
   * worker, and with it this set).
   */
  readonly #roots: BitSet<EntityIdx> = BitSet.empty(INITIAL_CAPACITY);

  /** EntityIdx→EntityId SharedArrayBuffer join map. The worker passes `republish` (fired
   * only on the rare re-allocation) and publishes {@link entityIdMap} once; reads are on
   * the main thread, on demand. */
  readonly #entityIdMap: EntityIdBuffer;

  constructor(republish?: RepublishHandler) {
    this.#entityIdMap = new EntityIdBuffer(INITIAL_CAPACITY, republish);
  }

  get size(): number {
    return this.#interner.size;
  }

  /** The EntityIdx→EntityId join map SharedArrayBuffer (the worker publishes it to the main thread). */
  get entityIdMap(): EntityIdBuffer {
    return this.#entityIdMap;
  }

  /**
   * Try to insert an entity. If new, allocates column slots and records its EntityId in
   * the join map (growing the map geometrically, like the columns, so per-insert writes
   * amortise O(1), never a grow-by-one per entity).
   */
  tryInsert(entityId: EntityId): [created: boolean, idx: EntityIdx] {
    const [created, idx] = this.#interner.tryIntern(entityId);
    if (created) {
      if (idx >= this.#entityIdMap.capacity) {
        this.#entityIdMap.ensureCapacity(
          Math.max(idx + 1, this.#entityIdMap.capacity * 2),
        );
      }
      this.#entityIdMap.setId(idx, entityId);
      this.#typeGroupIdx.push(-1);
      this.#labelIdx.push(-1);
    }
    return [created, idx];
  }

  tryGet(entityId: EntityId): EntityIdx | undefined {
    return this.#interner.tryGet(entityId);
  }

  getEntityId(idx: EntityIdx): EntityId {
    return this.#interner.getValue(idx);
  }

  setTypeGroup(entityIdx: EntityIdx, typeSetIdx: TypeSetIdx): void {
    this.#typeGroupIdx.set(entityIdx, typeSetIdx);
  }

  /** The type-set group an entity belongs to, or -1 if it's a link/unassigned. */
  getTypeGroup(entityIdx: EntityIdx): TypeSetIdx | -1 {
    return this.#typeGroupIdx.get(entityIdx);
  }

  setLabel(entityIdx: EntityIdx, labelIdx: number): void {
    this.#labelIdx.set(entityIdx, labelIdx);
  }

  /** Whether this entity is a query ROOT (vs a fetched-but-unexpanded FRONTIER node). O(1). */
  isRoot(entityIdx: EntityIdx): boolean {
    return this.#roots.has(entityIdx);
  }

  /**
   * Promote an entity to a root. Returns whether it FLIPPED (was a frontier node), so the caller
   * can recolour just that one record rather than re-styling the whole tier.
   */
  setRoot(entityIdx: EntityIdx): boolean {
    if (this.#roots.has(entityIdx)) {
      return false;
    }

    this.#roots.add(entityIdx);
    return true;
  }
}
