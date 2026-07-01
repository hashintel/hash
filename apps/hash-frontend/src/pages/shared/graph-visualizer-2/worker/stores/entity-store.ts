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
 * Entity ID interning and per-entity columnar storage.
 *
 * Column indices are kept in sync with the interner: each new entity
 * gets a push on every column, so EntityIdx indexes into all of them.
 */
export class EntityStore {
  readonly #interner: Interner<EntityId, EntityIdx> = new Interner();
  readonly #typeGroupIdx: Column<Uint32Array, TypeSetIdx | -1> = new Column(
    Uint32Array,
    INITIAL_CAPACITY,
  );

  readonly #labelIdx: Column<Int32Array> = new Column(Int32Array, 4096);

  /** Query roots. Add-only: roots only grow as the frontier expands. */
  readonly #roots: BitSet<EntityIdx> = BitSet.empty(INITIAL_CAPACITY);

  /** EntityIdx to EntityId shared buffer. */
  readonly #entityIdMap: EntityIdBuffer;

  constructor(republish?: RepublishHandler) {
    this.#entityIdMap = new EntityIdBuffer(INITIAL_CAPACITY, republish);
  }

  get size(): number {
    return this.#interner.size;
  }

  get entityIdMap(): EntityIdBuffer {
    return this.#entityIdMap;
  }

  /** Insert an entity if not already present. Returns whether it was newly created. */
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

  /** Whether this entity is a query root (vs frontier). */
  isRoot(entityIdx: EntityIdx): boolean {
    return this.#roots.has(entityIdx);
  }

  /** Promote an entity to a root. Returns whether it flipped (was previously frontier). */
  setRoot(entityIdx: EntityIdx): boolean {
    if (this.#roots.has(entityIdx)) {
      return false;
    }

    this.#roots.add(entityIdx);
    return true;
  }
}
