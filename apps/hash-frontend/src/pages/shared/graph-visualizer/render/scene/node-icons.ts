/**
 * Per-dot type-icon atlas keys for both tiers, index-aligned with each
 * layout's render records. Fires only on a structure/resolver change, and the
 * scan is incremental on the streaming path: the flat SAB is append-only
 * (see below), so a structure frame that only grew resolves icons for the
 * added tail `[prevCount, count)` and keeps the cached prefix. The icon
 * layers read the cached arrays (keyed by a version) every layer build.
 *
 * Node identity flows through the {@link SceneHandle}, so both worker
 * lifecycles share this scan (the icon resolver just answers by its own
 * NodeId currency).
 *
 * Why the flat prefix is reusable: flat records are ordered by ascending
 * join key in every code path. The entity tier seeds from the sorted
 * `snapshotNodeEntityIdxs()` column and appends newcomers (interner indices
 * are monotonic, so they sort after every existing record); the type tier
 * seeds from the interner's id order the same way. Stores are add-only, so
 * record `i` maps to the same node forever; a full rescan happens only on a
 * shrink (defensive; add-only stores cannot shrink) or when the flat layout
 * disappears (tier change).
 *
 * Cached keys are kept across resolver identity changes: the entity bridge
 * recreates the resolver on every appended page, and treating that as an
 * invalidation would re-trigger the full O(dots) rescan per batch this class
 * exists to avoid. Both streaming flows land a node and its type context
 * in the bridge before the worker's structure frame for it returns, so a
 * prefix `null` is a genuine no-icon answer, not a not-yet-known one.
 *
 * A cached key is the icon of the node's type set as the bridge captured
 * it when the record was first scanned. Type sets are editable in-product
 * (clicking a dot opens the entity editor in the slide stack), but an edit
 * does not reach an open graph: subgraph responses are unnormalized scalars
 * Apollo cannot update in place, no graph host wires an entity edit to a
 * refetch, and the worker pins type-derived grouping and dot colour at first
 * ingest, ignoring re-sent entities. Icon staleness is that same snapshot
 * contract, not an icon-specific carve-out; a full rescan (tier change or
 * remount) re-resolves icons while colours never refresh, so a dot's icon is
 * never staler than its colour. A bridge capture can still be replaced
 * mid-session (a later frontier expansion re-fetching an expansion-held
 * neighbour); hover cards and hub labels read the fresh copy on their next
 * build while icon and colour keep ingest state. Rescanning icons on such a
 * refresh would only desync them from colour, so showing type edits live is
 * an upstream product decision (refetch plus worker restyle), not a cache
 * policy here.
 *
 * Hierarchical leaves (entity lifecycle only) have no append-only guarantee
 * (group re-targeting can change a leaf's membership), so a leaf's cached
 * array is reused only while the leaf's `nodeIds` identity is unchanged.
 * Every leaf layout (re)build adopts a fresh `nodeIds` via LAYOUT_CREATED,
 * while a growth republish keeps it.
 */
import type { ClusterId } from "../../ids";
import type { IconAtlas } from "../gpu/icon-atlas";
import type { SceneCallbacks } from "./callbacks";
import type { SceneHandle } from "./handle";

export interface NodeIconsDependencies<
  NodeId extends string,
  NodeIndex extends number,
  EdgeIndex extends number,
> {
  readonly handle: SceneHandle<NodeId, NodeIndex, EdgeIndex>;
  readonly callbacks: () => SceneCallbacks<NodeId>;
  readonly iconAtlas: IconAtlas;
}

export class NodeIcons<
  NodeId extends string,
  NodeIndex extends number,
  EdgeIndex extends number,
> {
  readonly #dependencies: NodeIconsDependencies<NodeId, NodeIndex, EdgeIndex>;

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

  constructor(
    dependencies: NodeIconsDependencies<NodeId, NodeIndex, EdgeIndex>,
  ) {
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

  /** Number of flat-tier records whose icon keys have been resolved (the reusable prefix length). */
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
    const resolveIcon = this.#dependencies.callbacks().resolveNodeIcon;
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

    // Only the tail [from, to) is scanned; the prefix is index-aligned with the layout SAB.
    const scanRange = (
      layoutId: ClusterId,
      from: number,
      to: number,
    ): (string | null)[] => {
      const scanned: (string | null)[] = [];

      for (let index = from; index < to; index++) {
        let name: string | null = null;
        const nodeId = this.#dependencies.handle.resolveNodeId(layoutId, index);

        if (nodeId !== undefined) {
          const key = resolveIcon(nodeId);

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
