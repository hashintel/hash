/**
 * The camera: owns the Deck view state (never React state), the coarse zoom
 * buckets that gate expensive rebuilds, and the throttled viewport stream to
 * the worker's LOD. Camera moves flow through {@link SceneCamera.applyViewState},
 * which invokes {@link SceneCameraDependencies.afterViewStateApplied} when bucket crossings occur.
 */
import { LinearInterpolator } from "@deck.gl/core";

import {
  FLAT_HEADER_BYTES,
  FLAT_RADIUS_BYTE_OFFSET,
  FLAT_RECORD_BYTES,
  leafNodeX,
  leafNodeY,
} from "../../worker/buffers/position-buffer";
import {
  INITIAL_VIEW_STATE,
  WORKER_VIEWPORT_MIN_INTERVAL_MS,
  WorkerViewportSnapshot,
  iconZoomBucket,
  labelColorZoomBucket,
  labelZoomBucket,
  viewStateZoom,
} from "./view-state";

import type { PlacedCluster } from "../clusters";
import type { WorkerHandle } from "../worker-connection";
import type { ViewState } from "./view-state";
import type { Deck, OrthographicView } from "@deck.gl/core";

export interface ViewBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Which gated rebuilds a view-state change crossed into. */
export interface ZoomBucketChanges {
  readonly labelEligibilityChanged: boolean;
  readonly iconEligibilityChanged: boolean;
  readonly labelColorBucketChanged: boolean;
}

/** The world-space bounding box of everything currently rendered, or null before frames. */
function contentBounds(handle: WorkerHandle): ViewBounds | null {
  const positions = handle.getPositions();
  const structure = handle.getStructure();
  if (!positions || !structure) {
    return null;
  }

  let bounds: ViewBounds | null = null;
  const include = (x: number, y: number, radius: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return;
    }
    const next = {
      minX: x - radius,
      minY: y - radius,
      maxX: x + radius,
      maxY: y + radius,
    };
    bounds =
      bounds === null
        ? next
        : {
            minX: Math.min(bounds.minX, next.minX),
            minY: Math.min(bounds.minY, next.minY),
            maxX: Math.max(bounds.maxX, next.maxX),
            maxY: Math.max(bounds.maxY, next.maxY),
          };
  };

  const flatGraph = structure.flatGraph;
  if (flatGraph) {
    const flat = handle.getClusters().get(flatGraph.layoutId);
    if (flat) {
      const data = new DataView(flat.versionView.buffer);
      const count = data.getUint32(4, true);
      for (let index = 0; index < count; index++) {
        const recordOffset = FLAT_HEADER_BYTES + index * FLAT_RECORD_BYTES;
        include(
          data.getFloat32(recordOffset, true),
          data.getFloat32(recordOffset + 4, true),
          data.getFloat32(recordOffset + FLAT_RADIUS_BYTE_OFFSET, true),
        );
      }
    }
    return bounds;
  }

  const clusters = handle.getClusters();
  for (const [index, cluster] of structure.clusters.entries()) {
    const x = positions.clusterPositions[index * 2] ?? 0;
    const y = positions.clusterPositions[index * 2 + 1] ?? 0;
    include(x, y, cluster.radius);
  }

  for (const layer of structure.entityLayers) {
    const ref = clusters.get(layer.layoutId);
    if (!ref) {
      continue;
    }
    const originX = positions.clusterPositions[layer.leafClusterIndex * 2] ?? 0;
    const originY =
      positions.clusterPositions[layer.leafClusterIndex * 2 + 1] ?? 0;
    for (let index = 0; index < ref.nodeIds.length; index++) {
      include(
        originX + leafNodeX(ref.positions, index),
        originY + leafNodeY(ref.positions, index),
        // Leaf nodes have no per-record radius in the SAB; use a fixed 4-world-unit pad for fit-to-content bounds.
        4,
      );
    }
  }

  return bounds;
}

/**
 * World bounds of the largest rendered bubble, or null when none exists
 * (before frames, or flat-force without communities).
 *
 * Flat tier: the biggest Louvain community by member count, its bounds
 * gathered from the members' live SAB positions (padded by dot radius) --
 * this is the "giant ball" the BubbleSet layer draws. Hierarchical tier:
 * the largest leaf cluster bubble by world radius (depth > 0 are opened
 * containers, faint outlines whose fill lives in their leaves).
 */
function largestBubbleBounds(handle: WorkerHandle): ViewBounds | null {
  const positions = handle.getPositions();
  const structure = handle.getStructure();
  if (!positions || !structure) {
    return null;
  }

  const flatGraph = structure.flatGraph;
  if (flatGraph) {
    const membership = flatGraph.communities;
    if (!membership) {
      return null;
    }
    const flat = handle.getClusters().get(flatGraph.layoutId);
    if (!flat) {
      return null;
    }
    const data = new DataView(flat.versionView.buffer);
    const count = Math.min(data.getUint32(4, true), membership.length);

    const memberCounts = new Map<number, number>();
    let largestCommunity = -1;
    let largestSize = 0;
    for (let index = 0; index < count; index++) {
      const community = membership[index] ?? -1;
      if (community < 0) {
        continue;
      }
      const size = (memberCounts.get(community) ?? 0) + 1;
      memberCounts.set(community, size);
      if (size > largestSize) {
        largestSize = size;
        largestCommunity = community;
      }
    }
    if (largestCommunity < 0) {
      return null;
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let index = 0; index < count; index++) {
      if (membership[index] !== largestCommunity) {
        continue;
      }
      const recordOffset = FLAT_HEADER_BYTES + index * FLAT_RECORD_BYTES;
      const x = data.getFloat32(recordOffset, true);
      const y = data.getFloat32(recordOffset + 4, true);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        continue;
      }
      const radius = data.getFloat32(
        recordOffset + FLAT_RADIUS_BYTE_OFFSET,
        true,
      );
      minX = Math.min(minX, x - radius);
      minY = Math.min(minY, y - radius);
      maxX = Math.max(maxX, x + radius);
      maxY = Math.max(maxY, y + radius);
    }
    return minX === Infinity ? null : { minX, minY, maxX, maxY };
  }

  let largest: ViewBounds | null = null;
  let largestRadius = 0;
  for (const [index, cluster] of structure.clusters.entries()) {
    if (cluster.depth !== 0 || cluster.radius <= largestRadius) {
      continue;
    }
    const x = positions.clusterPositions[index * 2] ?? 0;
    const y = positions.clusterPositions[index * 2 + 1] ?? 0;
    largestRadius = cluster.radius;
    largest = {
      minX: x - cluster.radius,
      minY: y - cluster.radius,
      maxX: x + cluster.radius,
      maxY: y + cluster.radius,
    };
  }
  return largest;
}

export interface SceneCameraDependencies {
  readonly container: HTMLDivElement;
  readonly handle: WorkerHandle;
  readonly deck: () => Deck<OrthographicView>;
  /** React to a camera move: gated rebuilds + HTML overlay re-projection. */
  readonly afterViewStateApplied: (changes: ZoomBucketChanges) => void;
}

export class SceneCamera {
  readonly #dependencies: SceneCameraDependencies;

  #viewState: ViewState = INITIAL_VIEW_STATE;
  #labelZoomBucket = labelZoomBucket(viewStateZoom(INITIAL_VIEW_STATE));
  #iconZoomBucket = iconZoomBucket(viewStateZoom(INITIAL_VIEW_STATE));
  #labelColorZoomBucket = labelColorZoomBucket(
    viewStateZoom(INITIAL_VIEW_STATE),
  );

  #viewportFrame: number | null = null;
  #viewportTimer: number | null = null;
  #viewportDirty = false;
  readonly #nextViewport = new WorkerViewportSnapshot();
  readonly #lastViewport = new WorkerViewportSnapshot();
  #hasLastViewport = false;
  #lastViewportSentAt = 0;

  constructor(dependencies: SceneCameraDependencies) {
    this.#dependencies = dependencies;
  }

  get viewState(): ViewState {
    return this.#viewState;
  }

  get zoom(): number {
    return viewStateZoom(this.#viewState);
  }

  get iconBucket(): number {
    return this.#iconZoomBucket;
  }

  dispose(): void {
    if (this.#viewportFrame !== null) {
      cancelAnimationFrame(this.#viewportFrame);
    }
    if (this.#viewportTimer !== null) {
      clearTimeout(this.#viewportTimer);
    }
  }

  zoomBy(delta: number): void {
    const zoom = this.zoom;
    const nextZoom = Math.min(
      this.#maxZoom(),
      Math.max(this.#minZoom(), zoom + delta),
    );
    this.applyViewState({
      ...this.#viewState,
      zoomX: nextZoom,
      zoomY: nextZoom,
      transitionDuration: 160,
      transitionInterpolator: new LinearInterpolator(["zoomX", "zoomY"]),
    });
  }

  fitToContent(): void {
    const bounds = contentBounds(this.#dependencies.handle);
    if (bounds) {
      this.fitToBounds(bounds, 72);
    }
  }

  /**
   * Frame the largest rendered bubble (Louvain community on the flat tier,
   * leaf cluster otherwise) so it fills the padded viewport; fit-to-content
   * when none exists. Data-derived, so repeated calls frame the same view.
   */
  frameLargestBubble(): void {
    const bounds = largestBubbleBounds(this.#dependencies.handle);
    if (bounds) {
      this.fitToBounds(bounds, 48);
    } else {
      this.fitToContent();
    }
  }

  /** Frame a world-space box: centre it and zoom so it fills the padded viewport. */
  fitToBounds(bounds: ViewBounds, padding: number): void {
    const viewport = this.#dependencies.deck().getViewports()[0];
    if (!viewport) {
      return;
    }

    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const usableWidth = Math.max(1, viewport.width - padding * 2);
    const usableHeight = Math.max(1, viewport.height - padding * 2);
    const nextZoom = Math.log2(
      Math.min(usableWidth / width, usableHeight / height),
    );
    const clampedZoom = Math.min(
      this.#maxZoom(),
      Math.max(this.#minZoom(), nextZoom),
    );

    this.applyViewState({
      ...this.#viewState,
      target: [
        (bounds.minX + bounds.maxX) / 2,
        (bounds.minY + bounds.maxY) / 2,
        0,
      ],
      zoomX: clampedZoom,
      zoomY: clampedZoom,
      transitionDuration: 240,
      transitionInterpolator: new LinearInterpolator([
        "target",
        "zoomX",
        "zoomY",
      ]),
    });
  }

  /** Ease the camera to centre a point, holding the current zoom. */
  focusOn(x: number, y: number): void {
    this.#transitionTo({
      ...this.#viewState,
      target: [x, y, 0],
      transitionDuration: 350,
      transitionInterpolator: new LinearInterpolator(["target"]),
    });
  }

  /** Animate onto a cluster bubble so its on-screen radius crosses the open threshold. */
  zoomToBubble(placed: PlacedCluster): void {
    const targetZoom = Math.log2(Math.max(1e-3, 320 / placed.cluster.radius));
    this.#transitionTo({
      ...this.#viewState,
      target: [placed.x, placed.y, 0],
      zoomX: targetZoom,
      zoomY: targetZoom,
      transitionDuration: 450,
      transitionInterpolator: new LinearInterpolator([
        "target",
        "zoomX",
        "zoomY",
      ]),
    });
  }

  /**
   * Apply a view state and run the gated reactions: bucket-crossing rebuilds
   * (via the hook), the throttled worker viewport, and overlay re-projection.
   */
  applyViewState(viewState: ViewState): void {
    const nextZoom = viewStateZoom(viewState);
    const nextLabelZoomBucket = labelZoomBucket(nextZoom);
    const labelEligibilityChanged =
      nextLabelZoomBucket !== this.#labelZoomBucket;
    const nextIconZoomBucket = iconZoomBucket(nextZoom);
    const iconEligibilityChanged = nextIconZoomBucket !== this.#iconZoomBucket;
    const nextLabelColorZoomBucket = labelColorZoomBucket(nextZoom);
    const labelColorBucketChanged =
      nextLabelColorZoomBucket !== this.#labelColorZoomBucket;
    this.#viewState = viewState;
    this.#labelZoomBucket = nextLabelZoomBucket;
    this.#iconZoomBucket = nextIconZoomBucket;
    this.#labelColorZoomBucket = nextLabelColorZoomBucket;
    this.#dependencies.deck().setProps({ viewState });
    this.scheduleViewport();
    this.#dependencies.afterViewStateApplied({
      labelEligibilityChanged,
      iconEligibilityChanged,
      labelColorBucketChanged,
    });
  }

  /** Debounce + rate-limit the LOD viewport sent to the worker. */
  scheduleViewport(): void {
    this.#viewportDirty = true;
    if (this.#viewportFrame !== null || this.#viewportTimer !== null) {
      return;
    }
    const elapsed = performance.now() - this.#lastViewportSentAt;
    const delay = Math.max(0, WORKER_VIEWPORT_MIN_INTERVAL_MS - elapsed);
    const scheduleFrame = () => {
      this.#viewportFrame = requestAnimationFrame(() => {
        this.#viewportFrame = null;
        this.#emitViewport();
      });
    };
    if (delay === 0) {
      scheduleFrame();
    } else {
      this.#viewportTimer = window.setTimeout(() => {
        this.#viewportTimer = null;
        scheduleFrame();
      }, delay);
    }
  }

  #emitViewport(): void {
    if (!this.#viewportDirty) {
      return;
    }
    this.#viewportDirty = false;
    this.#nextViewport.update(this.#dependencies.container, this.#viewState);
    if (
      this.#hasLastViewport &&
      this.#nextViewport.equals(this.#lastViewport)
    ) {
      return;
    }
    this.#lastViewport.copyFrom(this.#nextViewport);
    this.#hasLastViewport = true;
    this.#lastViewportSentAt = performance.now();
    this.#dependencies.handle.sendViewport({
      zoom: this.#lastViewport.zoom,
      center: this.#lastViewport.center,
      width: this.#lastViewport.width,
      height: this.#lastViewport.height,
    });
  }

  // Transitions set the state and let Deck's onViewStateChange route the
  // animated frames back through applyViewState (which runs the gates).
  #transitionTo(next: ViewState): void {
    this.#viewState = next;
    this.#dependencies.deck().setProps({ viewState: next });
  }

  #minZoom(): number {
    return typeof this.#viewState.minZoom === "number"
      ? this.#viewState.minZoom
      : -12;
  }

  #maxZoom(): number {
    return typeof this.#viewState.maxZoom === "number"
      ? this.#viewState.maxZoom
      : 24;
  }
}
