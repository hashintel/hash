/**
 * Per-dot type-icon atlas keys for both tiers, index-aligned with each
 * layout's render records. Fires only on a structure/resolver change, and the
 * scan is INCREMENTAL on the streaming path (R2): the flat SAB is append-only
 * (see below), so a structure frame that only grew resolves icons for the
 * added tail `[prevCount, count)` and keeps the cached prefix. The icon
 * layers read the cached arrays (keyed by a version) every layer build.
 *
 * Why the flat prefix is reusable: flat records are ordered by ascending
 * entity index in every code path. `FlatTierController.#rebuildLayout` seeds
 * from the sorted `snapshotNodeEntityIdxs()` column, and `#absorbNodes`
 * appends newcomers (interner indices are monotonic, so they sort after every
 * existing record). Stores are add-only, so record `i` maps to the same
 * entity forever; a full rescan happens only on a shrink (defensive; add-only
 * stores cannot shrink) or when the flat layout disappears (tier change).
 *
 * Cached KEYS are kept across resolver identity changes: an entity's icon is
 * a function of its (immutable) type set, and both streaming flows populate
 * the bridge's type context before the worker's structure frame returns, so
 * a prefix `null` is a genuine no-icon answer, not a not-yet-known one. (The
 * bridge recreates the resolver on every appended page; treating that as an
 * invalidation would re-trigger the full O(dots) rescan per batch this class
 * exists to avoid. The trade-off: an icon EDITED mid-session refreshes on the
 * next full rescan (tier change or remount), not the next frame.)
 *
 * Hierarchical leaves have no append-only guarantee (group re-targeting can
 * change a leaf's membership), so a leaf's cached array is reused only while
 * the leaf's `nodeIds` identity is unchanged. Every leaf layout (re)build
 * adopts a fresh `nodeIds` via LAYOUT_CREATED, while a growth republish
 * keeps it.
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

  /** Flat-tier per-render-index icon atlas key. Extended in place on grow-only frames. */
  #flatNames: (string | null)[] = [];
  /** Records already resolved into {@link #flatNames} (the reusable prefix). */
  #flatScannedCount = 0;
  #flatLayoutId: ClusterId | undefined;
  /** Hierarchical per-leaf icon atlas keys. Shares version with {@link #flatNames}. */
  #leafNames = new Map<ClusterId, (string | null)[]>();
  /** Per-leaf `nodeIds` identity the cached array was resolved against. */
  #leafSourceNodeIds = new Map<ClusterId, readonly string[]>();
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

  /** Flat records resolved so far (the cached prefix length). Test/diagnostic hook. */
  get flatScannedCount(): number {
    return this.#flatScannedCount;
  }

  /**
   * Recompute per-render-index icon atlas keys for both tiers and ensure they
   * are rasterised. No zoom gate: the IconLayer's soft-LOD sizing handles
   * small dots. Bumps {@link version} only when a cached array actually
   * changed, so an unchanged frame (e.g. a communities-only Louvain refresh)
   * costs no resolver calls and no icon-attribute regeneration.
   */
  rebuild(): void {
    const resolveIcon = this.#dependencies.callbacks().resolveEntityIcon;
    const structure = this.#dependencies.handle.getStructure();

    if (resolveIcon === undefined || structure === undefined) {
      if (this.#flatNames.length > 0 || this.#leafNames.size > 0) {
        this.#version += 1;
      }

      this.#flatNames = [];
      this.#flatScannedCount = 0;
      this.#flatLayoutId = undefined;
      this.#leafNames = new Map();
      this.#leafSourceNodeIds = new Map();
      return;
    }

    const keys = new Set<string>();

    // Resolve records [from, to) of a layout SAB to their icon keys (index-aligned with the dots).
    const scanRange = (
      layoutId: ClusterId,
      from: number,
      to: number,
    ): (string | null)[] => {
      const scanned: (string | null)[] = [];

      for (let index = from; index < to; index++) {
        let name: string | null = null;
        const entityId = this.#dependencies.handle.resolveEntityId(
          layoutId,
          index,
        );

        if (entityId !== undefined) {
          const key = resolveIcon(entityId);

          if (key !== null && key.length > 0) {
            name = key;
            keys.add(key);
          }
        }

        scanned.push(name);
      }

      return scanned;
    };

    let changed = false;

    // Flat tier: one whole-graph SAB, append-only record order (see header).
    const flatGraph = structure.flatGraph;
    const flatUsable =
      flatGraph !== undefined &&
      this.#dependencies.handle.getClusters().get(flatGraph.layoutId) !==
        undefined;

    if (!flatUsable) {
      if (this.#flatNames.length > 0) {
        changed = true;
      }

      this.#flatNames = [];
      this.#flatScannedCount = 0;
      this.#flatLayoutId = undefined;
    } else {
      const prefixReusable =
        this.#flatLayoutId === flatGraph.layoutId &&
        flatGraph.count >= this.#flatScannedCount;

      if (!prefixReusable) {
        this.#flatNames = [];
        this.#flatScannedCount = 0;
      }

      if (flatGraph.count !== this.#flatScannedCount) {
        changed = true;

        for (const name of scanRange(
          flatGraph.layoutId,
          this.#flatScannedCount,
          flatGraph.count,
        )) {
          this.#flatNames.push(name);
        }

        this.#flatScannedCount = flatGraph.count;
      }

      this.#flatLayoutId = flatGraph.layoutId;
    }

    // Hierarchical tier: one SAB per open leaf. A leaf's cached keys stay
    // valid while its nodeIds identity holds (no membership change).
    const leafNames = new Map<ClusterId, (string | null)[]>();
    const leafSourceNodeIds = new Map<ClusterId, readonly string[]>();

    for (const layer of structure.entityLayers) {
      const cluster = this.#dependencies.handle
        .getClusters()
        .get(layer.layoutId);

      if (cluster === undefined) {
        continue;
      }

      const cached = this.#leafNames.get(layer.layoutId);
      const cacheValid =
        cached !== undefined &&
        cached.length === layer.count &&
        this.#leafSourceNodeIds.get(layer.layoutId) === cluster.nodeIds;

      if (cacheValid) {
        leafNames.set(layer.layoutId, cached);
      } else {
        leafNames.set(
          layer.layoutId,
          scanRange(layer.layoutId, 0, layer.count),
        );

        changed = true;
      }
      leafSourceNodeIds.set(layer.layoutId, cluster.nodeIds);
    }

    if (leafNames.size !== this.#leafNames.size) {
      changed = true;
    }

    this.#leafNames = leafNames;
    this.#leafSourceNodeIds = leafSourceNodeIds;

    if (changed) {
      this.#version += 1;
      // Rasterise any not-yet-known icons; emoji land synchronously, URLs resolve async and bump
      // the atlas version + re-push on load (so a still-loading icon is simply absent, then
      // appears). Incremental scans only collect the added range's keys; earlier keys are
      // already rasterised (ensureIcons is idempotent).
      this.#dependencies.iconAtlas.ensureIcons([...keys]);
    }
  }
}
