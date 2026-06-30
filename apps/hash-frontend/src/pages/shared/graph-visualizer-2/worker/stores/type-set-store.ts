import { ClusterId, TypeSetKey } from "../../ids";
import { BitSet } from "../collections/bitset";
import { Interner } from "../collections/interner";

import type { EntityIdx, TypeIdx, TypeSetIdx } from "../../ids";
import type { ReadonlySortedSet } from "../collections/readonly-sorted-set";
import type { TypeRegistry } from "./type-registry";

export class TypeSetGroup {
  readonly key: TypeSetKey;
  readonly idx: TypeSetIdx;
  readonly directTypeIdxs: ReadonlySortedSet<TypeIdx>;
  readonly standaloneClusterId: ClusterId;

  #entityIdxs: EntityIdx[] = [];
  #closure: BitSet<TypeIdx>;
  #version = 0;
  #assignedClusterId: ClusterId;
  #isStandalone = false;

  constructor(
    key: TypeSetKey,
    idx: TypeSetIdx,
    directTypeIdxs: ReadonlySortedSet<TypeIdx>,
    typeUniverseSize: number,
  ) {
    this.key = key;
    this.idx = idx;
    this.directTypeIdxs = directTypeIdxs;
    this.standaloneClusterId = ClusterId(`cluster:type:${key}`);
    this.#assignedClusterId = this.standaloneClusterId;
    this.#closure = BitSet.empty(typeUniverseSize);
  }

  get count(): number {
    return this.#entityIdxs.length;
  }

  get entityIdxs(): readonly EntityIdx[] {
    return this.#entityIdxs;
  }

  get closure(): BitSet<TypeIdx> {
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

  addEntity(entityIdx: EntityIdx): void {
    this.#entityIdxs.push(entityIdx);
    this.#version++;
  }

  /** Recompute the closure from the type registry's ancestor closures. */
  recomputeClosure(types: TypeRegistry): void {
    let closure = BitSet.empty<TypeIdx>(types.size);

    for (const typeIdx of this.directTypeIdxs) {
      const info = types.get(typeIdx);
      if (info) {
        closure = closure.or(info.ancestorClosure);
      }
    }

    this.#closure = closure;
  }
}

/**
 * Manages type-set groups: collections of entities that share
 * the same set of direct entity types.
 */
export class TypeSetStore {
  readonly #interner: Interner<TypeSetKey, TypeSetIdx> = new Interner();
  readonly #groups: Map<TypeSetKey, TypeSetGroup> = new Map();

  get size(): number {
    return this.#groups.size;
  }

  get(key: TypeSetKey): TypeSetGroup | undefined {
    return this.#groups.get(key);
  }

  getByIdx(idx: TypeSetIdx): TypeSetGroup | undefined {
    const key = this.#interner.getValue(idx);
    return this.#groups.get(key);
  }

  getOrCreate(
    directTypeIdxs: ReadonlySortedSet<TypeIdx>,
    typeUniverseSize: number,
  ): TypeSetGroup {
    const key = TypeSetKey(directTypeIdxs.items.join(","));
    const existing = this.#groups.get(key);
    if (existing) {
      return existing;
    }

    const idx = this.#interner.intern(key);
    const group = new TypeSetGroup(key, idx, directTypeIdxs, typeUniverseSize);
    this.#groups.set(key, group);

    return group;
  }

  *[Symbol.iterator](): IterableIterator<TypeSetGroup> {
    yield* this.#groups.values();
  }
}
