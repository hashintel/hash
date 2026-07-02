/**
 * Owns the Deck.gl instance and drives it imperatively from the worker handle's subscribe
 * stream: structure/position events rebuild the layer set off React, and the camera lives
 * in a field (never React state), so settling and pan/zoom never trigger a render. The
 * React component is a thin mount/dispose shell over this.
 *
 * The Scene itself is the layer-building composition root; the camera
 * ({@link SceneCamera}), interaction/selection state ({@link SceneInteractions}),
 * HTML hub labels ({@link HubLabels}), and icon-key resolution
 * ({@link EntityIcons}) are collaborators under `scene/`.
 */
import { Deck, OrthographicView } from "@deck.gl/core";

import {
  buildPlaced,
  clusterBubbleLayer,
  clusterEntityLayers,
  updatePlaced,
} from "./clusters";
import { communityLayer } from "./community";
import { edgeArrowLayer } from "./edge-arrows";
import { edgeLayer } from "./edges";
import { flatDotsLayer } from "./flat-dots";
import { IconAtlas } from "./gpu/icon-atlas";
import { clusterLabelLayer, edgeLabelLayer } from "./labels";
import { SceneCamera } from "./scene/camera";
import { EntityIcons } from "./scene/entity-icons";
import { HubLabels } from "./scene/hub-labels";
import { SceneInteractions } from "./scene/interactions";
import { RenderMetricsProbe } from "./scene/render-metrics";
import { ICON_ZOOM_BUCKETS_PER_UNIT } from "./scene/view-state";
import { selectionOverlayLayers } from "./selection";
import { leafTypeIconLayers, typeIconLayer } from "./type-icons";

import type { PositionsFrame, StructureFrame } from "../frames";
import type { PlacedCluster } from "./clusters";
import type { SceneCallbacks } from "./scene/callbacks";
import type { ZoomBucketChanges } from "./scene/camera";
import type { RenderCaptureReport } from "./scene/render-metrics";
import type { WorkerEvent, WorkerHandle } from "./worker-connection";
import type { Layer } from "@deck.gl/core";
import type { Device } from "@luma.gl/core";

export type {
  ClusterHover,
  EntityHover,
  EntityLabel,
  EntitySelection,
  HighwayHover,
  SceneCallbacks,
} from "./scene/callbacks";
export type { RenderCaptureReport } from "./scene/render-metrics";

function buildLabelLayers(
  structure: StructureFrame,
  positions: PositionsFrame,
  zoom: number,
  positionTick: number,
): Layer[] {
  const result: Layer[] = [];
  const edgeLabels = edgeLabelLayer(positions, zoom, positionTick);
  if (edgeLabels) {
    result.push(edgeLabels);
  }
  const clusterLabels = clusterLabelLayer(structure, positions, zoom);
  if (clusterLabels) {
    result.push(clusterLabels);
  }
  return result;
}

export class Scene {
  readonly #deck: Deck<OrthographicView>;
  readonly #handle: WorkerHandle;
  readonly #unsubscribe: () => void;

  #callbacks: SceneCallbacks;
  #dataLayers: Layer[] = [];
  #labelLayers: Layer[] = [];

  /** Rasterised type-icon atlas. Async rasters bump version and re-push layers. */
  readonly #iconAtlas: IconAtlas;
  /** The Deck GPU device, captured once it initialises; the atlas texture is built on it. */
  #device: Device | undefined;
  /** Scrim + ego overlay, pushed above data + labels: dims the field, redraws the ego bright. */
  #overlayLayers: Layer[] = [];
  #positionTick = 0;

  #firstStructureSeen = false;
  /**
   * Set by {@link dispose}. Async work (worker round-trips, icon rasters)
   * checks it before touching the finalized Deck or the disposed handle.
   */
  #disposed = false;
  /** Persistent cluster-bubble set: rebuilt on structure, positions mutated in place. */
  #placed: PlacedCluster[] = [];

  readonly #camera: SceneCamera;
  readonly #interactions: SceneInteractions;
  readonly #hubLabels: HubLabels;
  readonly #entityIcons: EntityIcons;
  /** Render-cost capture (dev harness benchmark); idle unless a capture is running. */
  readonly #renderMetrics = new RenderMetricsProbe();
  /** True while inside a timed rebuild, so nested rebuild paths count once. */
  #rebuildTimingActive = false;

  constructor(
    container: HTMLDivElement,
    handle: WorkerHandle,
    callbacks: SceneCallbacks,
  ) {
    this.#handle = handle;
    this.#callbacks = callbacks;
    // A finished async icon raster bumps the atlas version and re-pushes the layers so the
    // newly-ready icon appears (it was simply absent until now).
    this.#iconAtlas = new IconAtlas(() => this.#refreshDataLayers());

    this.#camera = new SceneCamera({
      container,
      handle,
      deck: () => this.#deck,
      afterViewStateApplied: (changes) => this.#afterViewStateApplied(changes),
    });

    this.#interactions = new SceneInteractions({
      handle,
      deck: () => this.#deck,
      callbacks: () => this.#callbacks,
      placed: () => this.#placed,
      zoom: () => this.#camera.zoom,
      isDisposed: () => this.#disposed,
      refreshDataLayers: () => this.#refreshDataLayers(),
      focusCamera: (x, y) => this.#camera.focusOn(x, y),
      zoomToBubble: (placed) => this.#camera.zoomToBubble(placed),
    });

    this.#hubLabels = new HubLabels({
      handle,
      deck: () => this.#deck,
      callbacks: () => this.#callbacks,
      zoom: () => this.#camera.zoom,
    });

    this.#entityIcons = new EntityIcons({
      handle,
      callbacks: () => this.#callbacks,
      iconAtlas: this.#iconAtlas,
    });

    this.#deck = new Deck<OrthographicView>({
      parent: container,
      views: new OrthographicView({ id: "main", controller: true }),
      controller: true,
      viewState: this.#camera.viewState,
      // Capture the GPU device so the icon atlas can build its texture on it; re-push once it is
      // available in case a structure frame (and its icon layer) arrived before init completed.
      onDeviceInitialized: (device) => {
        this.#device = device;
        this.#refreshDataLayers();
      },
      // Deck aggregates render stats once per second; the probe stores them
      // only while a capture is running.
      _onMetrics: (metrics) => {
        this.#renderMetrics.sampleDeckMetrics(metrics);
      },
      getCursor: ({ isDragging, isHovering }) => {
        if (isDragging) {
          return "grabbing";
        }
        return isHovering ? "pointer" : "grab";
      },
      onViewStateChange: ({ viewState }) =>
        this.#camera.applyViewState(viewState),
      // A pan begins: hover cards are anchored to moving graph geometry, so hide them until the
      // next hover rather than re-projecting React overlays on every drag frame.
      onDragStart: () => this.#interactions.onDragStart(),
      onDragEnd: () => this.#interactions.onDragEnd(),
      onClick: (info) => this.#interactions.handleClick(info),
      onHover: (info) => {
        this.#interactions.handleHover(info);
      },
      layers: [],
    });

    this.#camera.scheduleViewport();
    this.#unsubscribe = handle.subscribe((event) => this.#handleEvent(event));
  }

  /** Refresh the interaction callbacks without re-mounting Deck. */
  setCallbacks(callbacks: SceneCallbacks): void {
    this.#callbacks = callbacks;
  }

  zoomBy(delta: number): void {
    this.#camera.zoomBy(delta);
  }

  fitToContent(): void {
    this.#camera.fitToContent();
  }

  /** Begin a render-cost capture (deck stats + rebuild timings + zoom envelope). */
  startRenderCapture(): void {
    this.#renderMetrics.start(this.#camera.zoom);
  }

  /** End the capture started by {@link startRenderCapture} and summarise it. */
  stopRenderCapture(): RenderCaptureReport {
    return this.#renderMetrics.stop(this.#camera.zoom);
  }

  get renderCapturing(): boolean {
    return this.#renderMetrics.capturing;
  }

  dispose(): void {
    this.#disposed = true;
    this.#camera.dispose();
    this.#hubLabels.dispose();
    this.#unsubscribe();
    this.#iconAtlas.dispose();
    this.#deck.finalize();
  }

  #handleEvent(event: WorkerEvent): void {
    const structure = this.#handle.getStructure();
    const positions = this.#handle.getPositions();
    if (!structure || !positions) {
      return;
    }

    if (event.kind === "structure") {
      // Topology changed: rebuild the bubble set (new array identity -> Deck regenerates
      // all bubble attributes). The paired position event does the layer build + push.
      this.#placed = buildPlaced(structure, positions);

      // The cut can invalidate the selection / ego set; revalidate + re-query.
      this.#interactions.onStructure();

      // Structure changed (new dots, reorder, leaf open/close): recompute which dots label +
      // their text. The paired position event below rebuilds the layer from this cached set.
      this.#hubLabels.rebuild();

      // Same gating for the per-dot type-icon keys (the only O(dots) icon-resolution scan).
      this.#entityIcons.rebuild();

      return;
    }

    this.#positionTick += 1;
    this.#timedRebuild(() => {
      updatePlaced(this.#placed, positions);
      this.#dataLayers = this.#buildDataLayers(structure, positions);
      this.#rebuildLabels();
      this.#overlayLayers = this.#buildOverlay();
      this.#pushLayers();
    });
    // The selected node may have moved this tick: refresh the tracked overlays.
    this.#interactions.afterPositions();
    this.#hubLabels.schedule();
    if (!this.#firstStructureSeen) {
      this.#firstStructureSeen = true;
      this.#callbacks.onFirstStructure();
    }
  }

  // Edges + per-tier layers. Bubbles draw from the persistent `#placed` (so a settling
  // frame re-uploads only their positions); flat/hierarchical entity layers build from the
  // current frames.
  #buildDataLayers(
    structure: StructureFrame,
    positions: PositionsFrame,
  ): Layer[] {
    const clusters = this.#handle.getClusters();
    const result: Layer[] = [];
    // Layer order is RENDER order (later = on top). Hierarchical edges (feeders/highways) render
    // UNDER the faint container bubbles so they read THROUGH them with depth-opacity -- drawn over
    // the bubbles they wash out and effectively vanish. Picking is DECOUPLED from this order
    // (see SceneInteractions): an edge under a bubble still wins a click/hover, while a dot --
    // drawn on top -- still wins over an edge passing under it.
    const edges = edgeLayer(positions, structure.flatGraph !== undefined);
    const edgeArrows = edgeArrowLayer(positions, this.#camera.zoom);
    if (structure.flatGraph) {
      result.push(
        ...communityLayer(structure.flatGraph, clusters, positions.settled),
      );
      result.push(...edges);
      result.push(...edgeArrows);
      result.push(...flatDotsLayer(structure.flatGraph, clusters));
      // Type icons sit ON the dots (rendered after them). The device is required to build the atlas
      // texture, so before it initialises the icons are simply absent (they appear on the re-push
      // from onDeviceInitialized). The hierarchical leaf counterpart is in the other branch.
      if (this.#device !== undefined) {
        result.push(
          ...typeIconLayer({
            graph: structure.flatGraph,
            clusters,
            atlas: this.#iconAtlas,
            device: this.#device,
            names: this.#entityIcons.flatNames,
            namesVersion: this.#entityIcons.version,
            positionTick: this.#positionTick,
            zoom: this.#camera.iconBucket / ICON_ZOOM_BUCKETS_PER_UNIT,
            zoomBucket: this.#camera.iconBucket,
          }),
        );
      }
    } else {
      result.push(...edges);
      result.push(
        clusterBubbleLayer(
          this.#placed,
          this.#positionTick,
          this.#interactions.keepFullClusters(),
          this.#interactions.highlightTick,
        ),
      );
      result.push(...edgeArrows);
      result.push(
        ...clusterEntityLayers({
          structure,
          positions,
          clusters,
          positionTick: this.#positionTick,
          highlightedEntities: this.#interactions.highlightedEntities,
        }),
      );
      // Type icons sit ON the leaf dots (rendered after them), one IconLayer per open leaf. Gated on
      // the device the same way as the flat tier (the atlas texture needs it; absent until init).
      if (this.#device !== undefined) {
        result.push(
          ...leafTypeIconLayers({
            structure,
            positions,
            clusters,
            atlas: this.#iconAtlas,
            device: this.#device,
            namesByLeaf: this.#entityIcons.leafNames,
            namesVersion: this.#entityIcons.version,
            positionTick: this.#positionTick,
            zoom: this.#camera.iconBucket / ICON_ZOOM_BUCKETS_PER_UNIT,
            zoomBucket: this.#camera.iconBucket,
          }),
        );
      }
    }
    return result;
  }

  // The selection overlay, drawn over the base layers and labels. Just the selected node's ring
  // (empty data when nothing is selected, so the layer set stays stable). Ego neighbors are
  // conveyed by the focus dim, not rings.
  #buildOverlay(): Layer[] {
    return selectionOverlayLayers(
      this.#interactions.selectedGeometry(),
      this.#positionTick,
    );
  }

  /** Camera moved: run the bucket-gated rebuilds and re-project the HTML overlays. */
  #afterViewStateApplied(changes: ZoomBucketChanges): void {
    // Label layers rebuild on zoom bucket changes; a pure pan reprojects
    // via viewState with no rebuild (and records no rebuild span).
    if (
      changes.labelColorBucketChanged ||
      changes.labelEligibilityChanged ||
      changes.iconEligibilityChanged
    ) {
      this.#timedRebuild(() => {
        if (changes.labelColorBucketChanged) {
          this.#rebuildLabels();
        }
        if (changes.labelEligibilityChanged) {
          this.#hubLabels.rebuild();
        }
        if (changes.iconEligibilityChanged) {
          this.#refreshDataLayers();
        } else if (changes.labelColorBucketChanged) {
          this.#pushLayers();
        }
      });
    }
    // HTML overlays use projected screen coords, so they must re-project on
    // every camera move (pan included) or they freeze under the sliding canvas.
    this.#interactions.afterPositions();
    this.#hubLabels.schedule();
  }

  // Rebuild + push the data layers against the current frames (e.g. after a selection change
  // while the layout is settled, when no position event would otherwise refresh the ring).
  #refreshDataLayers(): void {
    // Reachable after dispose via async icon rasters and ego resolutions;
    // setProps on a finalized Deck throws.
    if (this.#disposed) {
      return;
    }
    const structure = this.#handle.getStructure();
    const positions = this.#handle.getPositions();
    if (!structure || !positions) {
      return;
    }
    this.#timedRebuild(() => {
      this.#dataLayers = this.#buildDataLayers(structure, positions);
      this.#overlayLayers = this.#buildOverlay();
      this.#pushLayers();
    });
  }

  /**
   * Run a synchronous layer-rebuild span under the metrics probe. Spans
   * nest (a zoom-bucket rebuild funnels into {@link #refreshDataLayers});
   * only the outermost records, so each rebuild is counted once, in full.
   */
  #timedRebuild(rebuild: () => void): void {
    if (!this.#renderMetrics.capturing || this.#rebuildTimingActive) {
      rebuild();
      return;
    }
    this.#rebuildTimingActive = true;
    const startMs = performance.now();
    try {
      rebuild();
    } finally {
      this.#rebuildTimingActive = false;
      this.#renderMetrics.recordRebuild(performance.now() - startMs);
      this.#renderMetrics.recordZoom(this.#camera.zoom);
    }
  }

  #pushLayers(): void {
    this.#deck.setProps({
      layers: [
        ...this.#dataLayers,
        ...this.#labelLayers,
        ...this.#overlayLayers,
      ],
    });
  }

  #rebuildLabels(): void {
    const structure = this.#handle.getStructure();
    const positions = this.#handle.getPositions();
    if (!structure || !positions) {
      return;
    }

    // Cluster + edge labels only. The hub-label overlay is HTML (see HubLabels), and the
    // entity-label layer rides the CURRENT #positionTick so it tracks the settling layout
    // (live SAB reads) -- this method only fires on zoom / structure.
    this.#labelLayers = buildLabelLayers(
      structure,
      positions,
      this.#camera.zoom,
      this.#positionTick,
    );
  }
}
