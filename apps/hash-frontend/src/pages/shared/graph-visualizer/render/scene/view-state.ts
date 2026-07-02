/**
 * Deck view-state helpers: reading the zoom out of a loosely-typed view
 * state, the coarse zoom buckets that gate expensive rebuilds, and the
 * quantised viewport snapshot sent to the worker.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deck.gl view state is loosely typed (target/zoom plus transition metadata passed through verbatim).
export type ViewState = Record<string, any>;

// zoomX/zoomY only, never scalar `zoom`: OrthographicView works in zoomX/zoomY internally;
// a stray `zoom` makes transitions compute their start from an inconsistent value and jerk.
export const INITIAL_VIEW_STATE: ViewState = {
  target: [0, 0, 0],
  zoomX: 0,
  zoomY: 0,
  minZoom: -12,
  maxZoom: 24,
};

/** Recompute label eligibility only when zoom crosses this coarse bucket. */
const LABEL_ZOOM_BUCKETS_PER_UNIT = 4;
/** Re-evaluate icon visibility/color only on coarse zoom buckets, not every wheel delta. */
export const ICON_ZOOM_BUCKETS_PER_UNIT = 8;
/** Cluster/edge label layers rebuild only when zoom crosses this bucket. */
const LABEL_COLOR_ZOOM_BUCKETS_PER_UNIT = 24;
/** Worker-side edge/LOD geometry does not need every tiny wheel delta. */
const WORKER_VIEWPORT_ZOOM_BUCKETS_PER_UNIT = 16;
const WORKER_VIEWPORT_MAX_FPS = 20;
export const WORKER_VIEWPORT_MIN_INTERVAL_MS = 1000 / WORKER_VIEWPORT_MAX_FPS;

export function viewStateZoom(viewState: ViewState): number {
  const { zoom, zoomX } = viewState;
  if (typeof zoomX === "number") {
    return zoomX;
  }
  if (typeof zoom === "number") {
    return zoom;
  }
  if (Array.isArray(zoom) && typeof zoom[0] === "number") {
    return zoom[0];
  }
  return 0;
}

export function labelZoomBucket(zoom: number): number {
  return Math.floor(zoom * LABEL_ZOOM_BUCKETS_PER_UNIT);
}

export function iconZoomBucket(zoom: number): number {
  return Math.floor(zoom * ICON_ZOOM_BUCKETS_PER_UNIT);
}

export function labelColorZoomBucket(zoom: number): number {
  return Math.round(zoom * LABEL_COLOR_ZOOM_BUCKETS_PER_UNIT);
}

function workerViewportZoom(zoom: number): number {
  return (
    Math.round(zoom * WORKER_VIEWPORT_ZOOM_BUCKETS_PER_UNIT) /
    WORKER_VIEWPORT_ZOOM_BUCKETS_PER_UNIT
  );
}

export class WorkerViewportSnapshot {
  zoom = 0;
  readonly center: [number, number] = [0, 0];
  centerX = 0;
  centerY = 0;
  width = 0;
  height = 0;

  update(container: HTMLDivElement, viewState: ViewState): void {
    const rect = container.getBoundingClientRect();
    const zoom = workerViewportZoom(viewStateZoom(viewState));
    const scale = 2 ** zoom;
    // Pan only affects hierarchical LOD when bubble centres cross meaningful screen-space thresholds.
    // Quantise to ~32px buckets so erratic drag does not spam equivalent LOD probes.
    const centerBucketWorld = 32 / Math.max(scale, 1e-6);
    const centerX = viewState.target[0] as number;
    const centerY = viewState.target[1] as number;
    this.zoom = zoom;
    this.centerX = Math.round(centerX / centerBucketWorld) * centerBucketWorld;
    this.centerY = Math.round(centerY / centerBucketWorld) * centerBucketWorld;
    this.center[0] = this.centerX;
    this.center[1] = this.centerY;
    this.width = Math.round(rect.width);
    this.height = Math.round(rect.height);
  }

  copyFrom(other: WorkerViewportSnapshot): void {
    this.zoom = other.zoom;
    this.centerX = other.centerX;
    this.centerY = other.centerY;
    this.center[0] = other.centerX;
    this.center[1] = other.centerY;
    this.width = other.width;
    this.height = other.height;
  }

  equals(other: WorkerViewportSnapshot | null): boolean {
    return (
      other !== null &&
      this.zoom === other.zoom &&
      this.centerX === other.centerX &&
      this.centerY === other.centerY &&
      this.width === other.width &&
      this.height === other.height
    );
  }
}
