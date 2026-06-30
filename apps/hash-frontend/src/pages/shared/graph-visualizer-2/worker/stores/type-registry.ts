import { extractBaseUrl } from "@blockprotocol/type-system";

import { BitSet } from "../collections/bitset";
import { Interner } from "../collections/interner";

import type { TypeIdx } from "../../ids";
import type { TypeSchemaEntry } from "../protocol";
import type { VersionedUrl } from "@blockprotocol/type-system";

export interface TypeInfo {
  readonly idx: TypeIdx;
  readonly url: VersionedUrl;
  readonly title: string;
  /** For a link type, its inverse (target -> source) title; used to label a reverse lane. */
  readonly inverseTitle?: string;
  readonly icon?: string;
  readonly parentIdxs: readonly TypeIdx[];
  readonly ancestorClosure: BitSet<TypeIdx>;
  readonly depth: number;
  readonly rootIdxs: readonly TypeIdx[];
}

/**
 * Owns the mapping from VersionedUrl to TypeIdx and the
 * per-type metadata (title, icon, parent refs, ancestor closure).
 */
export class TypeRegistry {
  readonly #interner: Interner<VersionedUrl, TypeIdx> = new Interner();
  readonly #types: (TypeInfo | undefined)[] = [];
  /**
   * Stable colour slot per type, assigned sorted-by-base-URL within each
   * registration batch and never reassigned (append-only). A type's colour is
   * derived from its slot, so it is identical across reloads (the slot depends
   * on the URL, not on arrival order) and unchanged when a later batch -- a new
   * page or a frontier expansion -- registers more types.
   */
  readonly #colorSlots: Map<TypeIdx, number> = new Map();
  #nextColorSlot = 0;

  get size(): number {
    return this.#interner.size;
  }

  intern(url: VersionedUrl): TypeIdx {
    return this.#interner.intern(url);
  }

  get(idx: TypeIdx): TypeInfo | undefined {
    return this.#types[idx];
  }

  getUrl(idx: TypeIdx): VersionedUrl | undefined {
    try {
      return this.#interner.getValue(idx);
    } catch {
      return undefined;
    }
  }

  /**
   * Debug: one line per registered type, idx, title, resolved parents/roots.
   * A parent that was interned (referenced via `allOf`) but never given a
   * schema shows as `#<idx>(unreg)`, the signature of a missing ancestor type,
   * which makes its descendants resolve to empty `rootIdxs`.
   */
  debugDump(): string {
    const name = (idx: TypeIdx): string =>
      this.#types[idx]?.title ?? `#${idx}(unreg)`;
    const lines: string[] = [];
    for (const info of this.#types) {
      if (!info) {
        continue;
      }
      const parents = info.parentIdxs.map(name).join(", ");
      const roots = info.rootIdxs.map(name).join(", ");
      lines.push(
        `#${info.idx} "${info.title}" parents=[${parents}] roots=[${roots}]`,
      );
    }
    return lines.join("\n");
  }

  /**
   * Register all type schemas. Two passes: first intern everything
   * (so parent refs resolve), then build ancestor closures.
   */
  registerAll(schemas: readonly TypeSchemaEntry[]): void {
    const newlyRegistered: TypeIdx[] = [];

    for (const schema of schemas) {
      const idx = this.#interner.intern(schema.url);

      // Skip if this type already has TypeInfo registered.
      if (this.#types[idx]) {
        continue;
      }

      newlyRegistered.push(idx);
      const parentIdxs = schema.allOfRefs.map((ref) =>
        this.#interner.intern(ref),
      );

      this.#types[idx] = {
        idx,
        url: schema.url,
        title: schema.title,
        inverseTitle: schema.inverseTitle,
        icon: schema.icon,
        parentIdxs,
        ancestorClosure: BitSet.empty(this.#interner.size),
        depth: 0,
        rootIdxs: [],
      };
    }

    if (newlyRegistered.length > 0) {
      this.#assignColorSlots(newlyRegistered);
      this.#computeClosures();
    }
  }

  /**
   * Assign a stable colour slot to each newly-registered type. Sorting the
   * batch by base URL makes the slot order deterministic regardless of the order
   * types arrived in this session, so the same type gets the same slot -- and so
   * the same colour -- on every reload. Slots are append-only: types from an
   * earlier batch keep theirs, so a later page or frontier expansion never
   * re-colours what is already on screen.
   */
  #assignColorSlots(newlyRegistered: readonly TypeIdx[]): void {
    const sorted = [...newlyRegistered].sort((left, right) => {
      const leftUrl = extractBaseUrl(this.#types[left]!.url);
      const rightUrl = extractBaseUrl(this.#types[right]!.url);
      if (leftUrl < rightUrl) {
        return -1;
      }
      return leftUrl > rightUrl ? 1 : 0;
    });
    for (const idx of sorted) {
      this.#colorSlots.set(idx, this.#nextColorSlot);
      this.#nextColorSlot += 1;
    }
  }

  /** Stable colour slot for a type, or undefined if not yet registered. */
  colorSlot(idx: TypeIdx): number | undefined {
    return this.#colorSlots.get(idx);
  }

  #computeClosures(): void {
    const universeSize = this.#interner.size;

    // Build closure bottom-up: each type's closure is itself + union of parent closures.
    // Since the type hierarchy is a DAG, iterate until stable.
    const closures = new Map<TypeIdx, BitSet<TypeIdx>>();
    const depths = new Map<TypeIdx, number>();
    const roots = new Map<TypeIdx, TypeIdx[]>();

    for (const info of this.#types) {
      if (!info) {
        continue;
      }

      const closure = BitSet.fromBit<TypeIdx>(universeSize, info.idx);
      closures.set(info.idx, closure);
      depths.set(info.idx, 0);
      roots.set(info.idx, []);
    }

    // Fixed-point iteration (typically converges in 2 to 3 passes for shallow hierarchies).
    let changed = true;
    while (changed) {
      changed = false;

      for (const info of this.#types) {
        if (!info) {
          continue;
        }

        const current = closures.get(info.idx)!;
        let merged = current;

        for (const parentIdx of info.parentIdxs) {
          const parentClosure = closures.get(parentIdx);
          if (parentClosure) {
            const next = merged.or(parentClosure);
            if (next.cardinality > merged.cardinality) {
              merged = next;
              changed = true;
            }
          }
        }

        closures.set(info.idx, merged);

        // Depth: 1 + max parent depth.
        if (info.parentIdxs.length > 0) {
          const parentDepth = Math.max(
            ...info.parentIdxs.map((parentIdx) => depths.get(parentIdx) ?? 0),
          );
          const newDepth = parentDepth + 1;
          if (newDepth > (depths.get(info.idx) ?? 0)) {
            depths.set(info.idx, newDepth);
            changed = true;
          }
        }

        // Roots: a parentless type is its own root; otherwise it inherits the
        // union of its parents' roots. This must live inside the fixed-point.
        // A single forward pass over idx order would read a parent's roots
        // before they were computed whenever the child was interned first,
        // and parents are interned lazily from `allOfRefs`, so child-before-
        // parent is the common case. That zeroed the child's roots and dropped
        // it into the catch-all "unknown" bucket (the Customer/Supplier bug).
        if (info.parentIdxs.length === 0) {
          if (roots.get(info.idx)!.length === 0) {
            roots.set(info.idx, [info.idx]);
            changed = true;
          }
        } else {
          const rootSet = new Set<TypeIdx>(roots.get(info.idx));
          const before = rootSet.size;
          for (const parentIdx of info.parentIdxs) {
            for (const rootIdx of roots.get(parentIdx) ?? []) {
              rootSet.add(rootIdx);
            }
          }
          if (rootSet.size > before) {
            roots.set(info.idx, [...rootSet]);
            changed = true;
          }
        }
      }
    }

    // Write back.
    for (let i = 0; i < this.#types.length; i++) {
      const info = this.#types[i];
      if (!info) {
        continue;
      }

      this.#types[i] = {
        ...info,
        ancestorClosure: closures.get(info.idx) ?? info.ancestorClosure,
        depth: depths.get(info.idx) ?? 0,
        rootIdxs: roots.get(info.idx) ?? [],
      };
    }
  }
}
