/**
 * Type registry: VersionedUrl interning, per-type metadata, ancestor
 * closures, and stable colour slot assignment.
 */
import { extractBaseUrl } from "@blockprotocol/type-system";

import { BitSet } from "../collections/bitset";
import { Interner } from "../collections/interner";

import type { TypeId } from "../../ids";
import type { TypeSchemaEntry } from "../protocol";
import type { VersionedUrl } from "@blockprotocol/type-system";

export interface TypeInfo {
  readonly id: TypeId;
  readonly url: VersionedUrl;
  readonly title: string;
  /** For a link type, the inverse (target to source) title. */
  readonly inverseTitle?: string;
  readonly icon?: string;
  readonly parentIds: readonly TypeId[];
  readonly ancestorClosure: BitSet<TypeId>;
  readonly depth: number;
  readonly rootIds: readonly TypeId[];
}

export class TypeRegistry {
  readonly #interner: Interner<VersionedUrl, TypeId>;
  readonly #types: (TypeInfo | undefined)[];
  /**
   * Stable colour slot per type. Sorted by base URL within each batch
   * and append-only, so a type's colour is deterministic across reloads.
   */
  readonly #colorSlots: Map<TypeId, number>;
  #nextColorSlot: number;

  constructor() {
    this.#interner = new Interner();
    this.#types = [];
    this.#colorSlots = new Map();
    this.#nextColorSlot = 0;
  }

  get size(): number {
    return this.#interner.size;
  }

  intern(url: VersionedUrl): TypeId {
    return this.#interner.intern(url);
  }

  get(id: TypeId): TypeInfo | undefined {
    return this.#types[id];
  }

  getUrl(id: TypeId): VersionedUrl | undefined {
    return id < this.#interner.size ? this.#interner.getValue(id) : undefined;
  }

  /** Stable colour slot for a type, or `undefined` if not yet registered. */
  colorSlot(id: TypeId): number | undefined {
    return this.#colorSlots.get(id);
  }

  /**
   * One line per registered type. An interned parent without a schema
   * shows as `#<id>(unreg)`.
   */
  debugDump(): string {
    const name = (id: TypeId): string =>
      this.#types[id]?.title ?? `#${id}(unreg)`;
    const lines: string[] = [];
    for (const info of this.#types) {
      if (!info) {
        continue;
      }
      const parents = info.parentIds.map(name).join(", ");
      const roots = info.rootIds.map(name).join(", ");
      lines.push(
        `#${info.id} "${info.title}" parents=[${parents}] roots=[${roots}]`,
      );
    }
    return lines.join("\n");
  }

  /**
   * Register type schemas. Two passes: first intern everything (so parent
   * refs resolve), then build ancestor closures. Returns whether any
   * schema was newly registered.
   */
  registerAll(schemas: readonly TypeSchemaEntry[]): boolean {
    const newlyRegistered: TypeId[] = [];

    for (const schema of schemas) {
      const id = this.#interner.intern(schema.url);

      if (this.#types[id]) {
        continue;
      }

      newlyRegistered.push(id);
      const parentIds = schema.allOfRefs.map((ref) =>
        this.#interner.intern(ref),
      );

      this.#types[id] = {
        id,
        url: schema.url,
        title: schema.title,
        inverseTitle: schema.inverseTitle,
        icon: schema.icon,
        parentIds,
        ancestorClosure: BitSet.empty(this.#interner.size),
        depth: 0,
        rootIds: [],
      };
    }

    if (newlyRegistered.length > 0) {
      this.#assignColorSlots(newlyRegistered);
      this.#computeClosures();
    }

    return newlyRegistered.length > 0;
  }

  #assignColorSlots(newlyRegistered: readonly TypeId[]): void {
    const sorted = [...newlyRegistered].sort((left, right) => {
      const leftUrl = extractBaseUrl(this.#types[left]!.url);
      const rightUrl = extractBaseUrl(this.#types[right]!.url);
      if (leftUrl < rightUrl) {
        return -1;
      }
      return leftUrl > rightUrl ? 1 : 0;
    });
    for (const id of sorted) {
      this.#colorSlots.set(id, this.#nextColorSlot);
      this.#nextColorSlot += 1;
    }
  }

  #computeClosures(): void {
    const universeSize = this.#interner.size;

    const closures = new Map<TypeId, BitSet<TypeId>>();
    const depths = new Map<TypeId, number>();
    const roots = new Map<TypeId, TypeId[]>();

    for (const info of this.#types) {
      if (!info) {
        continue;
      }
      closures.set(info.id, BitSet.fromBit<TypeId>(universeSize, info.id));
      depths.set(info.id, 0);
      roots.set(info.id, []);
    }

    // Fixed-point: closures, depths, and roots propagate up the DAG until stable.
    // Typically converges in 2 to 3 passes for shallow hierarchies.
    let changed = true;
    while (changed) {
      changed = false;

      for (const info of this.#types) {
        if (!info) {
          continue;
        }

        // Ancestor closure: self + union of parent closures.
        const current = closures.get(info.id)!;
        let merged = current;

        for (const parentId of info.parentIds) {
          const parentClosure = closures.get(parentId);
          if (parentClosure) {
            const next = merged.or(parentClosure);
            if (next.cardinality > merged.cardinality) {
              merged = next;
              changed = true;
            }
          }
        }

        closures.set(info.id, merged);

        // Depth: 1 + max parent depth.
        if (info.parentIds.length > 0) {
          const parentDepth = Math.max(
            ...info.parentIds.map((parentId) => depths.get(parentId) ?? 0),
          );
          const newDepth = parentDepth + 1;
          if (newDepth > (depths.get(info.id) ?? 0)) {
            depths.set(info.id, newDepth);
            changed = true;
          }
        }

        // Roots: a parentless type is its own root; otherwise inherit the
        // union of parent roots. Must be inside the fixed-point because
        // parents are interned lazily from allOfRefs (child-before-parent
        // is common), so a forward pass would read uncomputed parent roots.
        if (info.parentIds.length === 0) {
          if (roots.get(info.id)!.length === 0) {
            roots.set(info.id, [info.id]);
            changed = true;
          }
        } else {
          const rootSet = new Set<TypeId>(roots.get(info.id));
          const before = rootSet.size;
          for (const parentId of info.parentIds) {
            for (const rootId of roots.get(parentId) ?? []) {
              rootSet.add(rootId);
            }
          }
          if (rootSet.size > before) {
            roots.set(info.id, [...rootSet]);
            changed = true;
          }
        }
      }
    }

    for (let i = 0; i < this.#types.length; i++) {
      const info = this.#types[i];
      if (!info) {
        continue;
      }

      this.#types[i] = {
        ...info,
        ancestorClosure: closures.get(info.id) ?? info.ancestorClosure,
        depth: depths.get(info.id) ?? 0,
        rootIds: roots.get(info.id) ?? [],
      };
    }
  }
}
