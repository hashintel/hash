import type { ClusterId } from "../../ids";
import type { LayoutSimulation } from "../layout/force-simulation";

/** What a force layout's nodes represent: child cluster bubbles or entities. */
export type LayoutKind = "clusters" | "entities";

/**
 * The live force layouts, keyed by the cluster (or flat-tier) id they animate,
 * each tagged with what its nodes represent ({@link LayoutKind}).
 *
 * Invariant: a layout and its kind are registered and removed together;
 * `kindOf` is defined exactly for the ids `get` resolves.
 */
export class LayoutRegistry {
  readonly #layouts = new Map<ClusterId, LayoutSimulation>();
  readonly #kinds = new Map<ClusterId, LayoutKind>();

  get size(): number {
    return this.#layouts.size;
  }

  get(id: ClusterId): LayoutSimulation | undefined {
    return this.#layouts.get(id);
  }

  kindOf(id: ClusterId): LayoutKind | undefined {
    return this.#kinds.get(id);
  }

  has(id: ClusterId): boolean {
    return this.#layouts.has(id);
  }

  set(id: ClusterId, kind: LayoutKind, layout: LayoutSimulation): void {
    this.#layouts.set(id, layout);
    this.#kinds.set(id, kind);
  }

  /** Remove a layout and its kind. Returns whether the id was registered. */
  delete(id: ClusterId): boolean {
    this.#kinds.delete(id);
    return this.#layouts.delete(id);
  }

  clear(): void {
    this.#layouts.clear();
    this.#kinds.clear();
  }

  keys(): IterableIterator<ClusterId> {
    return this.#layouts.keys();
  }

  values(): IterableIterator<LayoutSimulation> {
    return this.#layouts.values();
  }

  entries(): IterableIterator<[ClusterId, LayoutSimulation]> {
    return this.#layouts.entries();
  }

  /** True while any cluster-level (macro/container) layout is still moving. */
  anyClusterLayoutRunning(): boolean {
    for (const [clusterId, layout] of this.#layouts) {
      if (
        this.#kinds.get(clusterId) === "clusters" &&
        layout.status === "running"
      ) {
        return true;
      }
    }

    return false;
  }

  /** Any layout (cluster or entity) still running; drives scheduler shutdown. */
  anyLayoutRunning(): boolean {
    for (const layout of this.#layouts.values()) {
      if (layout.status === "running") {
        return true;
      }
    }

    return false;
  }
}
