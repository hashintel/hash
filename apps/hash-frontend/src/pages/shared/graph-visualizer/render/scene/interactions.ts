/**
 * Click/hover dispatch and selection state: the selected node (ring + camera
 * focus + pinned card), a selected flat edge that is a node (a link entity:
 * pinned card only), and the ego highlight (dim everything except the
 * selection's neighbourhood). Hover-card state lives in {@link HoverTracker}.
 *
 * Node identity flows through the {@link SceneHandle}, so the same controller
 * serves both worker lifecycles; hierarchical-only affordances (highways,
 * pins, frontier bubbles) simply never trigger for lifecycles without that
 * tier.
 *
 * Owns no layers. Exposes selection geometry, ego-highlight state, and overlay
 * re-projection hooks consumed during layer builds and position/camera updates.
 */
import { liveNodeGeometry, linkMidpoint } from "./geometry";
import { HoverTracker } from "./hover-tracking";
import {
  isPickableEdgeLayer,
  PICKABLE_EDGE_LAYER_IDS,
  pickedFlatEdgeId,
  pickedHighwayLaneId,
  resolvePickedNode,
} from "./picking";

import type { ClusterId } from "../../ids";
import type { PlacedCluster } from "../clusters";
import type { Selection, SelectionGeometry } from "../selection";
import type { SceneCallbacks } from "./callbacks";
import type { SceneHandle } from "./handle";
import type { Deck, OrthographicView, PickingInfo } from "@deck.gl/core";

export interface SceneInteractionsDependencies<NodeId extends string> {
  readonly handle: SceneHandle<NodeId>;
  readonly deck: () => Deck<OrthographicView>;
  readonly callbacks: () => SceneCallbacks<NodeId>;
  /** The persistent cluster-bubble set (positions mutate in place per tick). */
  readonly placed: () => readonly PlacedCluster[];
  readonly zoom: () => number;
  readonly isDisposed: () => boolean;
  /** Trigger a data-layer rebuild when ring or dim state changes outside a position tick. */
  readonly refreshDataLayers: () => void;
  readonly focusCamera: (x: number, y: number) => void;
  readonly zoomToBubble: (placed: PlacedCluster) => void;
}

export class SceneInteractions<NodeId extends string> {
  readonly #dependencies: SceneInteractionsDependencies<NodeId>;
  readonly #hover: HoverTracker<NodeId>;

  #isDragging = false;

  /** The selected node dot: ring + camera focus + pinned card. Set on click. */
  #selected: Selection<NodeId> | null = null;
  /** A selected node-kind flat edge (a link entity, by its bezier edge id): a pinned card + Open,
   * no ring/dim (a link isn't a node to focus). Tracked by re-finding its bezier each emit.
   * Excludes #selected. */
  #selectedFlatEdge: number | null = null;
  /** The selected node's collapsed-cluster ego neighbours: the only ego targets we ring + keep at
   * full colour, since visible node neighbours read as the un-dimmed dots. */
  #egoClusterIds: readonly ClusterId[] = [];

  /** Bumped when the selection/ego changes, to re-evaluate the cluster-bubble focus dim. */
  #highlightTick = 0;
  /**
   * Monotonic counter bumped at the start of each ego query. {@link #highlightTick} catches up
   * when the async result lands; equality means the dim set matches the current selection (see
   * {@link queryEgo}).
   */
  #highlightVersion = 0;
  /** Node keys kept at full colour (selection + visible ego neighbours), used to dim
   * leaf-edge lines in step with their endpoint dots. */
  #highlightedNodeKeys: ReadonlySet<number> = new Set();

  constructor(dependencies: SceneInteractionsDependencies<NodeId>) {
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

  get highlightedNodeKeys(): ReadonlySet<number> {
    return this.#highlightedNodeKeys;
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
    return new Set(this.#egoClusterIds);
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
   * while it still resolves to the same node, then refresh the ego set.
   */
  onStructure(): void {
    if (
      this.#selected !== null &&
      this.#dependencies.handle.resolveNodeId(
        this.#selected.layoutId,
        this.#selected.localIndex,
      ) !== this.#selected.nodeId
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
    // Dots render above edges and bubbles, so a dot pick wins outright. Node opening is handled
    // by the pinned card's Open action, not this click handler.
    const picked = resolvePickedNode(this.#dependencies.handle, info);
    if (picked) {
      this.#select(picked);
      return;
    }
    // Click a flat edge: a node-kind edge (a link entity) pins its card (Open -> slideover), no
    // ring/dim; an edge-kind edge (a link type) shows its card at the click point. Click a
    // hierarchical highway: open a table of the links it aggregates. Edges render under the
    // bubbles but win the click over them (#edgePickFor queries the pickable edge layers when
    // the topmost pick is a bubble).
    const edgeInfo = this.#edgePickFor(info);
    if (edgeInfo) {
      const edgeId = pickedFlatEdgeId(this.#dependencies.handle, edgeInfo);
      const edgePick =
        edgeId === null
          ? null
          : this.#dependencies.handle.resolveFlatEdge(edgeId);
      if (edgeId !== null && edgePick?.kind === "node") {
        this.#selectFlatEdge(edgeId);
        return;
      }
      if (edgePick?.kind === "edge") {
        this.#hover.setEdge(edgePick, info.x, info.y);
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
    // Node dot (flat graph or an open hierarchical leaf): show its card at the cursor. Dots draw
    // on top, so a dot pick wins outright (and clears any highway summary).
    const picked = resolvePickedNode(this.#dependencies.handle, info);
    if (picked) {
      this.#hover.setNode(picked.nodeId, info.x, info.y);
      return;
    }
    // Edges render under the bubbles but still win a hover over them (#edgePickFor).
    const edgeInfo = this.#edgePickFor(info);
    if (edgeInfo) {
      // Flat edge, resolved via the handle: an entity graph's link is itself an entity (node
      // card); a type graph's edge is a link type (edge card).
      const edgeId = pickedFlatEdgeId(this.#dependencies.handle, edgeInfo);
      const edgePick =
        edgeId === null
          ? null
          : this.#dependencies.handle.resolveFlatEdge(edgeId);
      if (edgePick?.kind === "node") {
        this.#hover.setNode(edgePick.nodeId, info.x, info.y);
        return;
      }
      if (edgePick?.kind === "edge") {
        this.#hover.setEdge(edgePick, info.x, info.y);
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
    // The pinned card tracks a selected node (its dot) or a selected link edge (its midpoint).
    let world: { x: number; y: number } | null = null;
    let nodeId: NodeId | undefined;
    if (this.#selected !== null) {
      world = this.selectedGeometry();
      nodeId = this.#selected.nodeId;
    } else if (this.#selectedFlatEdge !== null) {
      const positions = this.#dependencies.handle.getPositions();
      world = positions
        ? linkMidpoint(positions, this.#selectedFlatEdge)
        : null;
      const pick = this.#dependencies.handle.resolveFlatEdge(
        this.#selectedFlatEdge,
      );
      nodeId = pick?.kind === "node" ? pick.nodeId : undefined;
    }
    if (world === null || nodeId === undefined) {
      // Nothing selected -> clear the card; a transiently missing geometry keeps the last
      // position rather than flickering the card off.
      if (this.#selected === null && this.#selectedFlatEdge === null) {
        this.#dependencies.callbacks().onNodeSelect?.(null);
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
    this.#dependencies.callbacks().onNodeSelect?.({ nodeId, x, y });
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

    const nodeKey = this.#dependencies.handle.nodeKeyAt(
      selection.layoutId,
      selection.localIndex,
    );

    if (nodeKey === undefined) {
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

    void this.#dependencies.handle.queryEgo(nodeKey).then((ego) => {
      if (this.#dependencies.isDisposed() || this.#selected !== selection) {
        return;
      }

      this.#egoClusterIds = ego.clusterIds;
      if (currentVersion !== this.#highlightVersion) {
        // While waiting for the result, someone else has already updated the highlight version;
        // ignore this result and wait for the next structure frame to re-query.
        return;
      }

      // The dim set: the selected node + its visible neighbours stay full colour;
      // collapsed-cluster neighbours are not opened (that would defeat the LOD), just dimmed.
      const highlighted = [nodeKey, ...ego.nodeKeys];

      this.#highlightedNodeKeys = new Set(highlighted);
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
   * Select a node dot, or clear with null: ring + camera focus + a pinned card. The ring
   * is part of the data layers (world-space); the pinned card is React, fed the node's
   * tracked screen position via onNodeSelect.
   */
  #select(selection: Selection<NodeId> | null): void {
    this.#selected = selection;
    this.#selectedFlatEdge = null;

    // A selection change un-dims immediately; the focus dim re-applies once the ego query
    // resolves -- so it never half-applies mid-resolve, and a re-query on a structure frame
    // (same selection) leaves the current dim untouched instead of flashing it off.
    this.#egoClusterIds = [];
    this.#highlightedNodeKeys = new Set();

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
   * Select a node-kind flat edge (a link entity): a pinned card (with Open) that tracks the
   * edge's midpoint -- no ring/dim/ego (a link isn't a node to focus). Clears any node
   * selection first (un-dims).
   */
  #selectFlatEdge(edgeId: number): void {
    this.#select(null);
    this.#selectedFlatEdge = edgeId;
    this.emitSelection();
  }

  /**
   * Open the link entities aggregated by a highway lane in a table (the slide-stack). Async:
   * the worker maps the laneId to its link node keys; we resolve those to node ids.
   */
  #openHighwayLinks(laneId: number): void {
    const onOpen = this.#dependencies.callbacks().onOpenLinkTable;
    if (!onOpen) {
      return;
    }

    void this.#dependencies.handle
      .queryHighwayLinks(laneId)
      .then((linkNodeKeys) => {
        if (this.#dependencies.isDisposed()) {
          return;
        }
        const linkNodeIds: NodeId[] = [];
        for (const nodeKey of linkNodeKeys) {
          const nodeId = this.#dependencies.handle.nodeKeyToId(nodeKey);
          if (nodeId !== undefined) {
            linkNodeIds.push(nodeId);
          }
        }
        if (linkNodeIds.length > 0) {
          onOpen(linkNodeIds);
        }
      });
  }

  /**
   * Pin the selected node's leaf open (hierarchical only -- the flat layout has no LOD) so it
   * stays visible as you zoom out for a birds-eye view; clear the pin on deselect.
   */
  #pinSelection(selection: Selection<NodeId> | null): void {
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
