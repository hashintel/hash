/**
 * Entity interning and per-entity columnar storage.
 *
 * Column indices are kept in sync with the interner: each new entity
 * gets a push on every column, so {@link EntityIndex} indexes into all
 * of them.
 */
import { EntityIdBuffer } from "../../buffers/entity-id-buffer";
import { BitSet } from "../../collections/bitset";
import { Column } from "../../collections/column";
import { Interner } from "../../collections/interner";

import type { EntityIndex, LabelId, TypeSetId } from "../../../ids";
import type { RepublishHandler } from "../../buffers/growable-buffer";
import type { EntityId } from "@blockprotocol/type-system";

// Initial column capacity (4096); growable buffers reallocate on republish
// when exceeded.
const INITIAL_CAPACITY = 4096;

export class EntityStore {
  readonly #interner: Interner<EntityId, EntityIndex>;
  readonly #type: Column<Int32Array, TypeSetId | -1>;
  readonly #label: Column<Int32Array, LabelId | -1>;
  /** Query roots. Add-only: roots only grow as the frontier expands. */
  readonly #root: BitSet<EntityIndex>;
  readonly #lookup: EntityIdBuffer;

  constructor(republish?: RepublishHandler) {
    this.#interner = new Interner();

    this.#type = new Column(Int32Array, INITIAL_CAPACITY);
    this.#label = new Column(Int32Array, INITIAL_CAPACITY);
    this.#root = BitSet.empty(INITIAL_CAPACITY);
    this.#lookup = new EntityIdBuffer(INITIAL_CAPACITY, republish);
  }

  get size(): number {
    return this.#interner.size;
  }

  /**
   * Shared lookup buffer mapping each {@link EntityIndex} to its
   * {@link EntityId}; worker writes on insert, main thread reads for UI
   * joins.
   */
  get lookupBuffer(): EntityIdBuffer {
    return this.#lookup;
  }

  /**
   * Interns an entity id, appends aligned type/label columns when new, and
   * writes the lookup buffer. Returns `[created, index]`.
   */
  insert(entityId: EntityId): [created: boolean, index: EntityIndex] {
    const [created, index] = this.#interner.tryIntern(entityId);

    if (!created) {
      return [false, index];
    }

    this.#lookup.ensureCapacity(index + 1);
    this.#lookup.setId(index, entityId);
    this.#type.push(-1);
    this.#label.push(-1);

    return [true, index];
  }

  lookup(entityId: EntityId): EntityIndex | undefined {
    return this.#interner.tryGet(entityId);
  }

  get(index: EntityIndex): EntityId | undefined {
    return this.#interner.getValue(index);
  }

  setTypeSet(index: EntityIndex, type: TypeSetId): void {
    this.#type.set(index, type);
  }

  /** The entity's type-set group, or -1 if unassigned. */
  getTypeSet(index: EntityIndex): TypeSetId | -1 {
    return this.#type.get(index);
  }

  setLabel(index: EntityIndex, label: LabelId): void {
    this.#label.set(index, label);
  }

  getLabel(index: EntityIndex): LabelId | -1 {
    return this.#label.get(index);
  }

  isRoot(index: EntityIndex): boolean {
    return this.#root.has(index);
  }

  /** Promote to root. Returns whether the entity was frontier before promotion. */
  insertRoot(index: EntityIndex): boolean {
    if (this.#root.has(index)) {
      return false;
    }

    this.#root.add(index);
    return true;
  }
}
