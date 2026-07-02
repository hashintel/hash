import { entityIndexFromNodeId } from "../../../ids";

import type { EntityIndex } from "../../../ids";

/** The slice of a layout simulation the cache keys on and reads. */
export interface LeafLayoutNodeIds {
  readonly nodeIds: readonly string[];
}

/**
 * Entity-index to local-slot maps for leaf layouts, keyed on the layout
 * object so an entry invalidates automatically when the node set changes
 * (a changed member set always produces a new layout).
 */
export class LeafLocalCache {
  readonly #cache = new WeakMap<
    LeafLayoutNodeIds,
    ReadonlyMap<EntityIndex, number>
  >();

  of(layout: LeafLayoutNodeIds): ReadonlyMap<EntityIndex, number> {
    const cached = this.#cache.get(layout);
    if (cached) {
      return cached;
    }

    const localOf = new Map<EntityIndex, number>();
    // idx is bounded by layout.nodeIds.length in the loop.
    for (let idx = 0; idx < layout.nodeIds.length; idx++) {
      localOf.set(entityIndexFromNodeId(layout.nodeIds[idx]!), idx);
    }

    this.#cache.set(layout, localOf);
    return localOf;
  }
}
