/**
 * Type-set grouping: entities that share the exact same set of direct
 * entity types belong to one {@link TypeSetGroup}.
 */
import { ClusterId, TypeSetKey } from "../../ids";
import { BitSet } from "../collections/bitset";
import { Column } from "../collections/column";
import { Interner } from "../collections/interner";

import type { EntityIndex, TypeId, TypeSetId } from "../../ids";
import type { ReadonlySortedSet } from "../collections/readonly-sorted-set";
import type { TypeRegistry } from "./type-registry";

const INITIAL_CAPACITY = 256;

/**
 * A group of entities that share the exact same set of direct entity types.
 *
 * The cluster tree decides whether a group is large enough to be its own
 * cluster ({@link isStandalone}) or should be merged into a type-ancestor
 * cluster. {@link assignedClusterId} tracks which cluster currently owns
 * this group's entities.
 */
export class TypeSetGroup {
  readonly key: TypeSetKey;
  readonly id: TypeSetId;
  readonly directTypeIds: ReadonlySortedSet<TypeId>;
  /** Cluster ID used when this group is large enough to stand alone. */
  readonly standaloneClusterId: ClusterId;

  readonly #entities: Column<Int32Array, EntityIndex>;
  /** Union of ancestor closures of all direct types; identifies candidate merge targets by type overlap. */
  #closure: BitSet<TypeId>;
  /** Monotonic counter bumped on each entity add so cluster assignment can detect membership changes without scanning entities. */
  #version = 0;
  /**
   * The cluster that currently owns this group's entities:
   * {@link standaloneClusterId} when standalone, or a merge target's ID
   * when the group is too small.
   */
  #assignedClusterId: ClusterId;
  #isStandalone = false;

  constructor(
    key: TypeSetKey,
    id: TypeSetId,
    directTypeIds: ReadonlySortedSet<TypeId>,
    typeUniverseSize: number,
  ) {
    this.key = key;
    this.id = id;
    this.directTypeIds = directTypeIds;
    this.standaloneClusterId = ClusterId(`cluster:type:${key}`);
    this.#assignedClusterId = this.standaloneClusterId;
    this.#closure = BitSet.empty(typeUniverseSize);
    this.#entities = new Column(Int32Array, INITIAL_CAPACITY);
  }

  get count(): number {
    return this.#entities.length;
  }

  get entities(): Column<Int32Array, EntityIndex> {
    return this.#entities;
  }

  get closure(): BitSet<TypeId> {
    return this.#closure;
  }

  get version(): number {
    return this.#version;
  }

  get assignedClusterId(): ClusterId {
    return this.#assignedClusterId;
  }

  set assignedClusterId(id: ClusterId) {
    this.#assignedClusterId = id;
  }

  get isStandalone(): boolean {
    return this.#isStandalone;
  }

  set isStandalone(value: boolean) {
    this.#isStandalone = value;
  }

  addEntity(index: EntityIndex): void {
    this.#entities.push(index);
    this.#version++;
  }

  /** Recompute the ancestor closure from the current type registry. */
  recomputeClosure(types: TypeRegistry): void {
    let closure = BitSet.empty<TypeId>(types.size);

    for (const typeId of this.directTypeIds) {
      const info = types.get(typeId);
      if (info) {
        closure = closure.or(info.ancestorClosure);
      }
    }

    this.#closure = closure;
  }
}

/** Manages {@link TypeSetGroup}s, interning by their canonical type-set key. */
export class TypeSetStore {
  readonly #interner: Interner<TypeSetKey, TypeSetId>;
  readonly #groups: Map<TypeSetKey, TypeSetGroup>;

  constructor() {
    this.#interner = new Interner();
    this.#groups = new Map();
  }

  get size(): number {
    return this.#groups.size;
  }

  get(key: TypeSetKey): TypeSetGroup | undefined {
    return this.#groups.get(key);
  }

  getById(id: TypeSetId): TypeSetGroup | undefined {
    const key = this.#interner.getValue(id);
    return this.#groups.get(key);
  }

  getOrCreate(
    directTypeIds: ReadonlySortedSet<TypeId>,
    typeUniverseSize: number,
  ): TypeSetGroup {
    const key = TypeSetKey(directTypeIds.items.join(","));
    const existing = this.#groups.get(key);
    if (existing) {
      return existing;
    }

    const id = this.#interner.intern(key);
    const group = new TypeSetGroup(key, id, directTypeIds, typeUniverseSize);
    this.#groups.set(key, group);

    return group;
  }

  *[Symbol.iterator](): IterableIterator<TypeSetGroup> {
    yield* this.#groups.values();
  }
}
