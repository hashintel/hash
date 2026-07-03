/**
 * Click/hover dispatch and selection state: the selected node (ring + camera
 * focus + pinned card), a selected link edge (pinned card only), and the ego
 * highlight (dim everything except the selection's neighbourhood). Hover-card
 * state lives in {@link HoverTracker}.
 *
 * Owns no layers. Exposes selection geometry, ego-highlight state, and overlay
 * re-projection hooks consumed during layer builds and position/camera updates.
 */
import { liveNodeGeometry, linkMidpoint } from "./geometry";
import { HoverTracker } from "./hover-tracking";
import {
  isPickableEdgeLayer,
  PICKABLE_EDGE_LAYER_IDS,
  pickedHighwayLaneId,
  pickedLinkEntityIdx,
  resolvePickedEntity,
} from "./picking";

import type { ClusterId, EntityIndex } from "../../ids";
import type { EgoTarget } from "../../worker/protocol";
import type { PlacedCluster } from "../clusters";
import type { Selection, SelectionGeometry } from "../selection";
import type { WorkerHandle } from "../entity-worker-connection";
import type { SceneCallbacks } from "./callbacks";
import type { EntityId } from "@blockprotocol/type-system";
import type { Deck, OrthographicView, PickingInfo } from "@deck.gl/core";

/**
 * A collapsed-cluster ego neighbor, by bubble id: the only ego target we ring + keep at full
 * colour, since visible entity neighbors read as the un-dimmed dots. Geometry is read live each
 * frame so the overlay tracks motion.
 */
interface EgoRef {
  readonly clusterId: ClusterId;
}

export interface SceneInteractionsDependencies {
  readonly handle: WorkerHandle;
  readonly deck: () => Deck<OrthographicView>;
  readonly callbacks: () => SceneCallbacks;
  /** The persistent cluster-bubble set (positions mutate in place per tick). */
  readonly placed: () => readonly PlacedCluster[];
  readonly zoom: () => number;
  readonly isDisposed: () => boolean;
  /** Trigger a data-layer rebuild when ring or dim state changes outside a position tick. */
  readonly refreshDataLayers: () => void;
  readonly focusCamera: (x: number, y: number) => void;
  readonly zoomToBubble: (placed: PlacedCluster) => void;
}

/**
 * Resolve the worker's ego targets to renderable refs: only collapsed-cluster neighbors are
 * ring + keep-full targets; entity neighbors read as the un-dimmed dots (the worker keeps
 * them at full colour via the highlight set).
 */
function resolveEgoTargets(targets: readonly EgoTarget[]): EgoRef[] {
  const refs: EgoRef[] = [];
  for (const target of targets) {
    if (target.kind === "cluster") {
      refs.push({ clusterId: target.clusterId });
    }
  }
  return refs;
}

export class SceneInteractions {
  readonly #dependencies: SceneInteractionsDependencies;
  readonly #hover: HoverTracker;

  #isDragging = false;

  /** The selected entity dot: ring + camera focus + pinned card. Set on click. */
  #selected: Selection | null = null;
  /** A selected link edge (the link's own EntityIdx): a pinned card + Open, no ring/dim (a link
   * isn't a node to focus). Tracked by re-finding its bezier each emit. Excludes #selected. */
  #selectedLink: EntityIndex | null = null;
  /** The selected node's ego (neighbors' visible representatives: dots and/or bubbles). */
  #egoTargets: EgoRef[] = [];

  /** Bumped when the selection/ego changes, to re-evaluate the cluster-bubble focus dim. */
  #highlightTick = 0;
  /**
   * Monotonic counter bumped at the start of each ego query. {@link #highlightTick} catches up
   * when the async result lands; equality means the dim set matches the current selection (see
   * {@link queryEgo}).
   */
  #highlightVersion = 0;
  /** Entity indices kept at full colour (selection + visible ego neighbors), used to dim
   * leaf-edge lines in step with their endpoint dots. */
  #highlightedEntities: ReadonlySet<EntityIndex> = new Set();

  constructor(dependencies: SceneInteractionsDependencies) {
    this.#dependencies = dependencies;
    this.#hover = new HoverTracker({
      handle: dependencies.handle,
      deck: dependencies.deck,
      callbacks: dependencies.callbacks,
      placed: dependencies.placed,
      zoom: dependencies.zoom,
    });
  }

  get highlightTick(): number {
    return this.#highlightTick;
  }

  get highlightedEntities(): ReadonlySet<EntityIndex> {
    return this.#highlightedEntities;
  }

  /** Live geometry of the selected node, for the ring overlay. Null when nothing is selected. */
  selectedGeometry(): SelectionGeometry | null {
    if (this.#selected === null) {
      return null;
    }
    return liveNodeGeometry(
      this.#dependencies.handle,
      this.#selected.layoutId,
      this.#selected.localIndex,
    );
  }

  /**
   * The clusters to keep at full colour while a selection is active (the ego's collapsed-
   * neighbor bubbles); null when nothing is selected. Every other leaf bubble recedes.
   */
  keepFullClusters(): ReadonlySet<ClusterId> | null {
    if (this.#selected === null || !this.#isEgoResolved()) {
      return null;
    }

    const keep = new Set<ClusterId>();
    for (const ref of this.#egoTargets) {
      keep.add(ref.clusterId);
    }
    return keep;
  }

  /** A pan begins: hover cards are anchored to moving graph geometry, so hide them. */
  onDragStart(): void {
    this.#isDragging = true;
    this.#hover.clearAll();
  }

  onDragEnd(): void {
    this.#isDragging = false;
  }

  /**
   * A structure frame landed: the cut changed, so a flat-buffer reorder (or a
   * closed leaf) can invalidate the selected index. Keep the selection only
   * while it still resolves to the same entity, then refresh the ego set.
   */
  onStructure(): void {
    if (
      this.#selected !== null &&
      this.#dependencies.handle.resolveEntityId(
        this.#selected.layoutId,
        this.#selected.localIndex,
      ) !== this.#selected.entityId
    ) {
      this.#selected = null;
    }
    this.queryEgo();
  }

  /** Re-project every tracked overlay (positions moved or the camera did). */
  afterPositions(): void {
    this.emitSelection();
    this.#hover.emitAnchored();
  }

  handleClick(info: PickingInfo): void {
    // Dots render above edges and bubbles, so a dot pick wins outright. Entity opening is handled
    // by the pinned card's Open action, not this click handler.
    const picked = resolvePickedEntity(this.#dependencies.handle, info);
    if (picked) {
      this.#select(picked);
      return;
    }
    // Click a flat link edge: pin its card (Open -> slideover), no ring/dim. Click a hierarchical
    // highway: open a table of the links it aggregates. Edges render under the bubbles but win the
    // click over them (#edgePickFor queries the pickable edge layers when the topmost pick is a
    // bubble).
    const edgeInfo = this.#edgePickFor(info);
    if (edgeInfo) {
      const linkEntityIdx = pickedLinkEntityIdx(
        this.#dependencies.handle,
        edgeInfo,
      );
      if (linkEntityIdx !== null) {
        this.#selectLink(linkEntityIdx);
        return;
      }
      const laneId = pickedHighwayLaneId(this.#dependencies.handle, edgeInfo);
      if (laneId !== null) {
        this.#openHighwayLinks(laneId);
        return;
      }
    }
    // Cluster bubble: animate so its on-screen radius crosses the open threshold.
    // Deck only attaches PlacedCluster to cluster-bubble layer picks.
    const placed = info.object as PlacedCluster | undefined;
    if (placed?.cluster) {
      this.#dependencies.zoomToBubble(placed);
      return;
    }
    this.#select(null);
  }

  handleHover(info: PickingInfo): void {
    if (this.#isDragging) {
      return;
    }
    // Entity dot (flat graph or an open hierarchical leaf): show its card at the cursor. Dots draw
    // on top, so a dot pick wins outright (and clears any highway summary).
    const picked = resolvePickedEntity(this.#dependencies.handle, info);
    if (picked) {
      this.#hover.setEntity(picked.entityId, info.x, info.y);
      return;
    }
    // Edges render under the bubbles but still win a hover over them (#edgePickFor).
    const edgeInfo = this.#edgePickFor(info);
    if (edgeInfo) {
      // Flat edge: a link is an entity, so show the same card for the link entity.
      const linkEntityIdx = pickedLinkEntityIdx(
        this.#dependencies.handle,
        edgeInfo,
      );
      const linkEntityId =
        linkEntityIdx === null
          ? null
          : (this.#dependencies.handle.entityIdToId(linkEntityIdx) ?? null);
      if (linkEntityId !== null) {
        this.#hover.setEntity(linkEntityId, info.x, info.y);
        return;
      }
      // Hierarchical highway: a summary of the links it bundles.
      const laneId = pickedHighwayLaneId(this.#dependencies.handle, edgeInfo);
      const lane =
        laneId === null
          ? undefined
          : this.#dependencies.handle.getStructure()?.highwayLanes[laneId];
      if (laneId !== null && lane && lane.count > 0) {
        this.#hover.setHighway(laneId, info.x, info.y);
        return;
      }
    }
    // Wholly-frontier cluster bubble (no dot/edge over it): offer to load its entities. Anchored to
    // the bubble so the load card tracks it through pan / settle.
    // Cluster-bubble layer objects are always PlacedCluster.
    const placed = info.object as PlacedCluster | undefined;
    const frontierIds = placed?.cluster.frontierEntityIds;
    if (placed && frontierIds && frontierIds.length > 0) {
      this.#hover.setCluster(placed.cluster.id);
      return;
    }
    this.#hover.clearAll();
  }

  /**
   * Push the selected node's current screen position to React so the pinned card tracks it
   * through settle + pan/zoom; emit null only when nothing is selected (a transient missing
   * geometry keeps the last position rather than flickering the card off).
   */
  emitSelection(): void {
    // The pinned card tracks a selected node (its dot) or a selected link (its edge midpoint).
    let world: { x: number; y: number } | null = null;
    let entityId: EntityId | undefined;
    if (this.#selected !== null) {
      world = this.selectedGeometry();
      entityId = this.#selected.entityId;
    } else if (this.#selectedLink !== null) {
      const positions = this.#dependencies.handle.getPositions();
      world = positions ? linkMidpoint(positions, this.#selectedLink) : null;
      entityId = this.#dependencies.handle.entityIdToId(this.#selectedLink);
    }
    if (world === null || entityId === undefined) {
      // Nothing selected -> clear the card; a transiently missing geometry keeps the last
      // position rather than flickering the card off.
      if (this.#selected === null && this.#selectedLink === null) {
        this.#dependencies.callbacks().onEntitySelect?.(null);
      }
      return;
    }
    const viewport = this.#dependencies.deck().getViewports()[0];
    if (!viewport) {
      return;
    }
    const projected = viewport.project([world.x, world.y]);
    const x = projected[0];
    const y = projected[1];
    if (x === undefined || y === undefined) {
      return;
    }
    this.#dependencies.callbacks().onEntitySelect?.({ entityId, x, y });
  }

  /**
   * Fetch + resolve the selected node's visible neighbors for ego-highlight. Async (a worker
   * round-trip); a result that lands after the selection changed is dropped.
   */
  queryEgo(): void {
    const selection = this.#selected;

    if (selection === null) {
      this.#dependencies.handle.setHighlight([]);
      return;
    }

    const entityIdx = this.#dependencies.handle.entityIdxAt(
      selection.layoutId,
      selection.localIndex,
    );

    if (entityIdx === undefined) {
      // Transient (e.g. the flat buffer reordered mid-resolve); keep the current dim and let
      // the next structure frame re-query, rather than flicker it off and back on.
      return;
    }

    // Bump the version, then capture it as this query's -- the order is load-bearing: capturing
    // before the bump leaves it one behind, so the guard below would drop even this query's own
    // result. A later query (re-select / structure re-query) bumps again, so a stale in-flight
    // result sees currentVersion !== #highlightVersion and drops; only the most recent applies.
    this.#highlightVersion += 1;
    const currentVersion = this.#highlightVersion;

    void this.#dependencies.handle.queryEgo(entityIdx).then((targets) => {
      if (this.#dependencies.isDisposed() || this.#selected !== selection) {
        return;
      }

      this.#egoTargets = resolveEgoTargets(targets);
      if (currentVersion !== this.#highlightVersion) {
        // While waiting for the result, someone else has already updated the highlight version;
        // ignore this result and wait for the next structure frame to re-query.
        return;
      }

      // The dim set: the selected node + its visible (entity) neighbors stay full colour;
      // collapsed-cluster neighbors are not opened (that would defeat the LOD), just dimmed.
      const highlighted = [entityIdx];
      for (const target of targets) {
        if (target.kind === "entity") {
          highlighted.push(target.entityIdx);
        }
      }

      this.#highlightedEntities = new Set(highlighted);
      this.#highlightTick = this.#highlightVersion;

      this.#dependencies.handle.setHighlight(highlighted);
      this.#dependencies.refreshDataLayers();
    });
  }

  /**
   * The edge pick for a cursor, decoupled from render order. Edges render under the cluster bubbles
   * (for the depth-opacity look) but must still win a click/hover over a bubble. If the topmost pick
   * is already an edge, use it; if it's a bubble, an edge may sit under it, so query the pickable
   * edge layers directly -- deck renders only those layers to the pick buffer, ignoring the bubble
   * on top. Returns null over empty space / dots, so the extra pick render happens only when the
   * cursor is over a bubble.
   */
  #edgePickFor(info: PickingInfo): PickingInfo | null {
    if (isPickableEdgeLayer(info.layer?.id)) {
      return info;
    }
    // Only cluster-bubble layer picks carry a PlacedCluster with a .cluster field.
    const overBubble =
      (info.object as PlacedCluster | undefined)?.cluster !== undefined;
    if (!overBubble) {
      return null;
    }
    return this.#dependencies.deck().pickObject({
      x: info.x,
      y: info.y,
      radius: 4,
      layerIds: PICKABLE_EDGE_LAYER_IDS,
    });
  }

  /**
   * Select an entity dot, or clear with null: ring + camera focus + a pinned card. The ring
   * is part of the data layers (world-space); the pinned card is React, fed the node's
   * tracked screen position via onEntitySelect.
   */
  #select(selection: Selection | null): void {
    this.#selected = selection;
    this.#selectedLink = null;

    // A selection change un-dims immediately; the focus dim re-applies once the ego query
    // resolves -- so it never half-applies mid-resolve, and a re-query on a structure frame
    // (same selection) leaves the current dim untouched instead of flashing it off.
    this.#egoTargets = [];
    this.#highlightedEntities = new Set();

    // Bump highlightTick with highlightVersion so the dim overlay stays stable
    // through the in-flight ego re-query (avoids a one-frame undim flash).
    this.#highlightVersion += 1;
    this.#highlightTick = this.#highlightVersion;

    if (selection) {
      const geometry = this.selectedGeometry();
      if (geometry) {
        this.#dependencies.focusCamera(geometry.x, geometry.y);
      }
    }

    this.#pinSelection(selection);
    this.queryEgo();
    this.emitSelection();
    this.#dependencies.refreshDataLayers();
  }

  /**
   * Select a link edge: a pinned card (with Open) that tracks the link's midpoint -- no
   * ring/dim/ego (a link isn't a node to focus). Clears any node selection first (un-dims).
   */
  #selectLink(linkEntityIdx: EntityIndex): void {
    this.#select(null);
    this.#selectedLink = linkEntityIdx;
    this.emitSelection();
  }

  /**
   * Open the link entities aggregated by a highway lane in a table (the slide-stack). Async:
   * the worker maps the laneId to its link EntityIdx set; we resolve those to EntityIds.
   */
  #openHighwayLinks(laneId: number): void {
    const onOpen = this.#dependencies.callbacks().onOpenLinkTable;
    if (!onOpen) {
      return;
    }

    void this.#dependencies.handle
      .queryHighwayLinks(laneId)
      .then((linkEntityIdxs) => {
        if (this.#dependencies.isDisposed()) {
          return;
        }
        const linkEntityIds: EntityId[] = [];
        for (const entityIdx of linkEntityIdxs) {
          const entityId = this.#dependencies.handle.entityIdToId(entityIdx);
          if (entityId !== undefined) {
            linkEntityIds.push(entityId);
          }
        }
        if (linkEntityIds.length > 0) {
          onOpen(linkEntityIds);
        }
      });
  }

  /**
   * Pin the selected node's leaf open (hierarchical only -- the flat layout has no LOD) so it
   * stays visible as you zoom out for a birds-eye view; clear the pin on deselect.
   */
  #pinSelection(selection: Selection | null): void {
    if (selection === null) {
      this.#dependencies.handle.setPinned(null);
      return;
    }
    const cluster = this.#dependencies.handle
      .getClusters()
      .get(selection.layoutId);
    this.#dependencies.handle.setPinned(
      cluster && cluster.flatCapacity === undefined ? selection.layoutId : null,
    );
  }

  #isEgoResolved(): boolean {
    return this.#highlightVersion === this.#highlightTick;
  }
}
