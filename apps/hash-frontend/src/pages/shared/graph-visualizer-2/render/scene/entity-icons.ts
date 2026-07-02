/**
 * Per-dot type-icon atlas keys for both tiers, index-aligned with each
 * layout's render records. The scan is O(dots) and fires only on a
 * structure/resolver change; the icon layers read the cached arrays (keyed by
 * a version) every layer build.
 */
import type { ClusterId } from "../../ids";
import type { IconAtlas } from "../gpu/icon-atlas";
import type { WorkerHandle } from "../worker-connection";
import type { SceneCallbacks } from "./callbacks";

export interface EntityIconsDependencies {
  readonly handle: WorkerHandle;
  readonly callbacks: () => SceneCallbacks;
  readonly iconAtlas: IconAtlas;
}

export class EntityIcons {
  readonly #dependencies: EntityIconsDependencies;

  /** Flat-tier per-render-index icon atlas key. Rebuilt on structure/resolver change. */
  #flatNames: (string | null)[] = [];
  /** Hierarchical per-leaf icon atlas keys. Shares version with {@link #flatNames}. */
  #leafNames = new Map<ClusterId, (string | null)[]>();
  #version = 0;

  constructor(dependencies: EntityIconsDependencies) {
    this.#dependencies = dependencies;
  }

  get flatNames(): (string | null)[] {
    return this.#flatNames;
  }

  get leafNames(): Map<ClusterId, (string | null)[]> {
    return this.#leafNames;
  }

  get version(): number {
    return this.#version;
  }

  /**
   * Recompute per-render-index icon atlas keys for both tiers and ensure they
   * are rasterised. No zoom gate: the IconLayer's soft-LOD sizing handles
   * small dots.
   */
  rebuild(): void {
    const resolveIcon = this.#dependencies.callbacks().resolveEntityIcon;
    const structure = this.#dependencies.handle.getStructure();
    if (resolveIcon === undefined || structure === undefined) {
      this.#flatNames = [];
      this.#leafNames = new Map();
      this.#version += 1;
      return;
    }

    const keys = new Set<string>();
    // Resolve every record of a layout SAB to its icon key (or null), index-aligned with the dots.
    const scanLayout = (
      layoutId: ClusterId,
      count: number,
    ): (string | null)[] => {
      const names = Array.from<string | null>({ length: count }).fill(null);
      for (let index = 0; index < count; index++) {
        const entityId = this.#dependencies.handle.resolveEntityId(
          layoutId,
          index,
        );
        if (entityId === undefined) {
          continue;
        }
        const key = resolveIcon(entityId);
        if (key !== null && key.length > 0) {
          names[index] = key;
          keys.add(key);
        }
      }
      return names;
    };

    // Flat tier: one whole-graph SAB.
    const flatGraph = structure.flatGraph;
    this.#flatNames =
      flatGraph !== undefined &&
      this.#dependencies.handle.getClusters().get(flatGraph.layoutId) !==
        undefined
        ? scanLayout(flatGraph.layoutId, flatGraph.count)
        : [];

    // Hierarchical tier: one SAB per open leaf.
    const leafNames = new Map<ClusterId, (string | null)[]>();
    for (const layer of structure.entityLayers) {
      if (
        this.#dependencies.handle.getClusters().get(layer.layoutId) !==
        undefined
      ) {
        leafNames.set(layer.layoutId, scanLayout(layer.layoutId, layer.count));
      }
    }
    this.#leafNames = leafNames;

    this.#version += 1;
    // Rasterise any not-yet-known icons; emoji land synchronously, URLs resolve async and bump the
    // atlas version + re-push on load (so a still-loading icon is simply absent, then appears).
    this.#dependencies.iconAtlas.ensureIcons([...keys]);
  }
}
