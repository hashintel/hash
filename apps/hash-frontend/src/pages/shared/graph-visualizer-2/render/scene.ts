/**
 * Owns the Deck.gl instance and drives it imperatively from the worker handle's subscribe
 * stream: structure/position events rebuild the layer set off React, and the camera lives
 * in a field (never React state), so settling and pan/zoom never trigger a render. The
 * React component is a thin mount/dispose shell over this.
 */
import { Deck, LinearInterpolator, OrthographicView } from "@deck.gl/core";

import { BEZIER_NO_LINK } from "../frames";
import {
  FLAT_HEADER_BYTES,
  FLAT_RADIUS_BYTE_OFFSET,
  FLAT_RECORD_BYTES,
  leafNodeX,
  leafNodeY,
} from "../worker/buffers/position-buffer";
import { radiusForDegree } from "../worker/entity-style";
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
import { nodeGeometry, selectionOverlayLayers } from "./selection";
import { leafTypeIconLayers, typeIconLayer } from "./type-icons";

import type { PositionsFrame, StructureFrame } from "../frames";
import type { ClusterId, EntityIdx } from "../ids";
import type { EgoTarget } from "../worker/protocol";
import type { PlacedCluster } from "./clusters";
import type { Selection, SelectionGeometry } from "./selection";
import type { WorkerEvent, WorkerHandle } from "./worker-connection";
import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";
import type { Layer, PickingInfo } from "@deck.gl/core";
import type { Device } from "@luma.gl/core";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deck.gl view state is loosely typed (target/zoom plus transition metadata passed through verbatim).
type ViewState = Record<string, any>;

const FLAT_EDGE_LAYER_ID = "flat-edges";
const HIERARCHICAL_EDGE_LAYER_ID = "hierarchical-edges";
const PICKABLE_EDGE_LAYER_IDS = [
  FLAT_EDGE_LAYER_ID,
  HIERARCHICAL_EDGE_LAYER_ID,
] as const;

function isPickableEdgeLayer(layerId: string | undefined): boolean {
  return (
    layerId === FLAT_EDGE_LAYER_ID || layerId === HIERARCHICAL_EDGE_LAYER_ID
  );
}

interface ViewBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

// zoomX/zoomY only, never scalar `zoom`: OrthographicView works in zoomX/zoomY internally;
// a stray `zoom` makes transitions compute their start from an inconsistent value and jerk.
const INITIAL_VIEW_STATE: ViewState = {
  target: [0, 0, 0],
  zoomX: 0,
  zoomY: 0,
  minZoom: -12,
  maxZoom: 24,
};

/**
 * Minimum on-screen dot DIAMETER (px) for its entity label to be eligible. Under OrthographicView
 * one world unit is `2 ** zoom` px, so a dot of `worldRadius` clears this once
 * `worldRadius * 2 * 2 ** zoom > ENTITY_LABEL_MIN_SCREEN_DIAMETER`. This is the on-screen-size bar;
 * WHICH dots are hubs is a separate by-radius cut (see {@link HUB_LABEL_MIN_RADIUS}). Ordinary
 * entities are never labelled; their detail is hover-only (the card).
 */
const ENTITY_LABEL_MIN_SCREEN_DIAMETER = 24;

/**
 * Hub selection for always-on labels. A dot is a hub by its by-degree RADIUS -- the worker's
 * authoritative connectivity (it sizes every dot this way, counting links a main-thread prop tally
 * would miss, e.g. frontier-expansion links). Eligible = radius of at least a {@link
 * HUB_LABEL_MIN_DEGREE}-degree node; of those (and on-screen-large enough), only the largest
 * {@link HUB_LABEL_MAX_COUNT} are labelled, so the labels orient the view without crowding it.
 */
const HUB_LABEL_MIN_DEGREE = 4;
const HUB_LABEL_MIN_RADIUS = radiusForDegree(HUB_LABEL_MIN_DEGREE);
const HUB_LABEL_MAX_COUNT = 12;

/**
 * Off-screen margin (px) for culling HTML entity labels: keep a label whose dot sits just past the
 * edge (so it shows partially) but drop the rest, so React only renders what's on screen.
 */
const ENTITY_LABEL_CULL_MARGIN_PX = 80;

/** Gap (px) between a hub dot's edge and its label, which sits to the dot's right. */
const ENTITY_LABEL_GAP_PX = 6;
const ENTITY_LABEL_MAX_WIDTH_PX = 180;
const ENTITY_LABEL_HEIGHT_PX = 22;
const ENTITY_LABEL_APPROX_CHAR_WIDTH_PX = 7;
const ENTITY_LABEL_COLLISION_PADDING_PX = 4;
/** Recompute label eligibility only when zoom crosses this coarse bucket. */
const LABEL_ZOOM_BUCKETS_PER_UNIT = 4;
/** Re-evaluate icon visibility/color only on coarse zoom buckets, not every wheel delta. */
const ICON_ZOOM_BUCKETS_PER_UNIT = 8;
/** Worker-side edge/LOD geometry does not need every tiny wheel delta. */
const WORKER_VIEWPORT_ZOOM_BUCKETS_PER_UNIT = 16;
const WORKER_VIEWPORT_MAX_FPS = 20;
const WORKER_VIEWPORT_MIN_INTERVAL_MS = 1000 / WORKER_VIEWPORT_MAX_FPS;

function viewStateZoom(viewState: ViewState): number {
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

function labelZoomBucket(zoom: number): number {
  return Math.floor(zoom * LABEL_ZOOM_BUCKETS_PER_UNIT);
}

function iconZoomBucket(zoom: number): number {
  return Math.floor(zoom * ICON_ZOOM_BUCKETS_PER_UNIT);
}

function workerViewportZoom(zoom: number): number {
  return (
    Math.round(zoom * WORKER_VIEWPORT_ZOOM_BUCKETS_PER_UNIT) /
    WORKER_VIEWPORT_ZOOM_BUCKETS_PER_UNIT
  );
}

class WorkerViewportSnapshot {
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

/** A hovered flat-tier entity: its id and the cursor position in container pixels. */
export interface EntityHover {
  readonly entityId: EntityId;
  readonly x: number;
  readonly y: number;
}

/** A hovered aggregated highway: a summary of the links it bundles, at the cursor. */
export interface HighwayHover {
  /** The lane's single link type (for the main thread to resolve the icon); null for a rollup. */
  readonly typeId: VersionedUrl | null;
  readonly typeLabel: string;
  readonly count: number;
  readonly direction: "forward" | "reverse" | "both";
  readonly x: number;
  readonly y: number;
}

/**
 * A hovered wholly-frontier cluster bubble (every member fetched-but-unexpanded): its frontier
 * EntityIds plus the bubble's on-screen geometry, re-emitted as the camera moves / layout settles
 * so an action card can sit at its edge and offer to load it. Null on leave.
 */
export interface ClusterHover {
  readonly count: number;
  readonly frontierEntityIds: readonly EntityId[];
  /** Bubble centre in container pixels. */
  readonly x: number;
  readonly y: number;
  /** Bubble on-screen radius (px), so the card can sit just outside its edge. */
  readonly radiusPx: number;
}

/**
 * The selected entity: its id and its on-screen position in container pixels, re-emitted as
 * the node settles and the camera moves so a pinned card can follow it.
 */
export interface EntitySelection {
  readonly entityId: EntityId;
  readonly x: number;
  readonly y: number;
}

/**
 * An always-on entity label to overlay as HTML: the entity, its display name, and its CURRENT
 * on-screen position (container pixels). The Scene re-emits the visible set each frame so the
 * labels track the camera / settling layout; React renders them over the canvas (viewport-culled),
 * so they read in the hash-frontend design language rather than as GPU text.
 */
export interface EntityLabel {
  readonly entityId: EntityId;
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

/**
 * The cached set of which flat-tier dots carry an always-on (hub) label, with the resolved text + entity.
 * Rebuilt ONLY on a zoom / structure change ({@link Scene["#rebuildEntityLabelData"]} -- the perf
 * rule); each frame the Scene projects each datum's LIVE SAB position and emits the on-screen ones
 * as {@link EntityLabel}s. `recordIndex` is the render index in the layout's SAB as it was scanned.
 */
interface EntityLabelDatum {
  readonly layoutId: ClusterId;
  readonly recordIndex: number;
  readonly entityId: EntityId;
  readonly text: string;
  /** The dot's world radius, so the label can sit just below the dot's edge at any zoom. */
  readonly worldRadius: number;
}

/**
 * A collapsed-cluster ego neighbor, by bubble id: the only ego target we ring + keep at full
 * colour, since visible entity neighbors read as the un-dimmed dots. Geometry is read live each
 * frame so the overlay tracks motion.
 */
type EgoRef = { readonly clusterId: ClusterId };

export interface SceneCallbacks {
  /** Report the hovered flat-tier entity, or null on leave. */
  readonly onEntityHover?: (hover: EntityHover | null) => void;
  /** Report a hovered aggregated highway's summary, or null on leave. */
  readonly onHighwayHover?: (hover: HighwayHover | null) => void;
  /** Report the selected entity + its tracked on-screen position, or null when cleared. */
  readonly onEntitySelect?: (selection: EntitySelection | null) => void;
  /** Open a table of the link entities aggregated by a clicked highway (hierarchical tier). */
  readonly onOpenLinkTable?: (linkEntityIds: readonly EntityId[]) => void;
  /** Report a hovered wholly-frontier cluster bubble (offer to load its entities), or null on leave. */
  readonly onClusterHover?: (hover: ClusterHover | null) => void;
  /**
   * Resolve an entity's display label (its name) for the always-on graph labels. Called only
   * while the label SET is (re)built -- on a zoom / structure change -- never per frame.
   */
  readonly resolveEntityLabel?: (entityId: EntityId) => string | undefined;
  /**
   * Resolve an entity's type icon to an atlas KEY (an emoji or an image URL), or null for none
   * (a ReactElement / absent icon has no atlas entry). Called only while the icon SET is
   * (re)built -- on a structure change -- never per frame. See {@link Scene["#rebuildEntityIconData"]}.
   */
  readonly resolveEntityIcon?: (entityId: EntityId) => string | null;
  /**
   * Report the always-on entity (hub) labels to overlay as HTML, re-emitted each frame with their
   * current on-screen positions (so they track the camera / settle). Empty when none are visible.
   */
  readonly onEntityLabels?: (labels: readonly EntityLabel[]) => void;
  /** Fired once, when the first structure frame lands (to drop the loading overlay). */
  readonly onFirstStructure: () => void;
}

export class Scene {
  readonly #deck: Deck<OrthographicView>;
  readonly #handle: WorkerHandle;
  readonly #container: HTMLDivElement;
  readonly #unsubscribe: () => void;

  #callbacks: SceneCallbacks;
  #viewState: ViewState = INITIAL_VIEW_STATE;
  #dataLayers: Layer[] = [];
  #labelLayers: Layer[] = [];
  #labelZoomBucket = labelZoomBucket(viewStateZoom(INITIAL_VIEW_STATE));
  #iconZoomBucket = iconZoomBucket(viewStateZoom(INITIAL_VIEW_STATE));
  /**
   * The always-on entity-label SET + resolved text. Rebuilt ONLY on a zoom or structure change
   * (the perf rule -- never an O(n) scan or a label resolve on a pan / position frame); the
   * TextLayer then reads each dot's LIVE position from the SAB per-datum on `#positionTick`.
   */
  #entityLabelData: EntityLabelDatum[] = [];
  /**
   * Per-render-index type-icon atlas key (or null), for the flat tier, in the layout SAB's record
   * order as it was last scanned. Rebuilt ONLY on a structure change / resolver change (the perf
   * rule -- the only O(dots) icon-resolution scan), exactly like {@link #entityLabelData}; the
   * IconLayer indexes it by render index. {@link #entityIconNamesVersion} bumps with it to drive
   * the layer's getIcon trigger.
   */
  #entityIconNames: (string | null)[] = [];
  /**
   * Per open hierarchical leaf (keyed by `layoutId`), the per-local-index type-icon atlas key (or
   * null), in the leaf SAB's record order. The hierarchical counterpart of {@link #entityIconNames};
   * scanned in the same {@link Scene["#rebuildEntityIconData"]} pass and sharing its version.
   */
  #leafIconNames = new Map<ClusterId, (string | null)[]>();
  #entityIconNamesVersion = 0;
  /**
   * The rasterised type-icon atlas (emoji + URL silhouettes) feeding the type-icon IconLayers (flat
   * tier + per-leaf hierarchical). Async rasters bump its version + call back into
   * {@link #refreshDataLayers} so a finished icon appears.
   */
  readonly #iconAtlas: IconAtlas;
  /** The Deck GPU device, captured once it initialises; the atlas texture is built on it. */
  #device: Device | undefined;
  /** Scrim + ego overlay, pushed above data + labels: dims the field, redraws the ego bright. */
  #overlayLayers: Layer[] = [];
  #positionTick = 0;
  /** Bumped when the selection/ego changes, to re-evaluate the cluster-bubble focus dim. */
  #highlightTick = 0;
  /* Used in conjunction with highlightTick, if they are the same, then ego has been resolved */
  #highlightVersion = 0;
  /** Highlighted entities (selection + visible ego), mirroring what was sent to the worker, so
   * the internal leaf-edge lines dim in step with the dots they connect. */
  #highlightedEntities: ReadonlySet<EntityIdx> = new Set();
  #hoveredEntity: EntityId | null = null;
  /**
   * The hovered highway's lane + the hovered point in WORLD space. Kept so the summary card tracks
   * the highway as the camera pans / the layout settles -- re-projected by {@link #emitHighwayHover}
   * on every view change + frame, the same way the pinned selection card tracks its node.
   */
  #hoveredHighway: { laneId: number; worldX: number; worldY: number } | null =
    null;

  /**
   * The hovered wholly-frontier cluster bubble, by id. Kept so the load card tracks the bubble as
   * the camera pans / the layout settles -- re-projected by {@link #emitClusterHover} on every view
   * change + frame, like {@link #hoveredHighway}. Its frontier data is read live from {@link #placed}.
   */
  #hoveredClusterId: ClusterId | null = null;

  /** The selected entity dot: ring + camera focus + pinned card. Set on click. */
  #selected: Selection | null = null;
  /** A selected link EDGE (the link's own EntityIdx): a pinned card + Open, no ring/dim (a link
   * isn't a node to focus). Tracked by re-finding its bezier each emit. Excludes #selected. */
  #selectedLink: EntityIdx | null = null;
  /** The selected node's ego (neighbors' visible representatives: dots and/or bubbles). */
  #egoTargets: EgoRef[] = [];

  #firstStructureSeen = false;
  #viewportFrame: number | null = null;
  #viewportTimer: number | null = null;
  #viewportDirty = false;
  readonly #nextViewport = new WorkerViewportSnapshot();
  readonly #lastViewport = new WorkerViewportSnapshot();
  #hasLastViewport = false;
  #lastViewportSentAt = 0;
  #entityLabelsFrame: number | null = null;
  #isDragging = false;
  /** Persistent cluster-bubble set: rebuilt on structure, positions mutated in place. */
  #placed: PlacedCluster[] = [];

  constructor(
    container: HTMLDivElement,
    handle: WorkerHandle,
    callbacks: SceneCallbacks,
  ) {
    this.#container = container;
    this.#handle = handle;
    this.#callbacks = callbacks;
    // A finished async icon raster bumps the atlas version and re-pushes the layers so the
    // newly-ready icon appears (it was simply absent until now).
    this.#iconAtlas = new IconAtlas(() => this.#refreshDataLayers());

    this.#deck = new Deck<OrthographicView>({
      parent: container,
      views: new OrthographicView({ id: "main", controller: true }),
      controller: true,
      viewState: this.#viewState,
      // Capture the GPU device so the icon atlas can build its texture on it; re-push once it is
      // available in case a structure frame (and its icon layer) arrived before init completed.
      onDeviceInitialized: (device) => {
        this.#device = device;
        this.#refreshDataLayers();
      },
      getCursor: ({ isDragging, isHovering }) => {
        if (isDragging) {
          return "grabbing";
        }
        return isHovering ? "pointer" : "grab";
      },
      onViewStateChange: ({ viewState }) =>
        this.#handleViewStateChange(viewState as ViewState),
      // A pan begins: hover cards are anchored to moving graph geometry, so hide them until the
      // next hover rather than re-projecting React overlays on every drag frame.
      onDragStart: () => {
        this.#isDragging = true;
        this.#clearHover();
        this.#clearHighwayHover();
        this.#clearClusterHover();
      },
      onDragEnd: () => {
        this.#isDragging = false;
      },
      onClick: (info) => this.#handleClick(info),
      onHover: (info) => {
        this.#handleHover(info);
      },
      layers: [],
    });

    this.#scheduleViewport();
    this.#unsubscribe = handle.subscribe((event) => this.#handleEvent(event));
  }

  /** Refresh the interaction callbacks without re-mounting Deck. */
  setCallbacks(callbacks: SceneCallbacks): void {
    this.#callbacks = callbacks;
  }

  zoomBy(delta: number): void {
    const zoom = viewStateZoom(this.#viewState);
    const minZoom =
      typeof this.#viewState.minZoom === "number"
        ? this.#viewState.minZoom
        : -12;
    const maxZoom =
      typeof this.#viewState.maxZoom === "number"
        ? this.#viewState.maxZoom
        : 24;
    const nextZoom = Math.min(maxZoom, Math.max(minZoom, zoom + delta));
    this.#applyViewState({
      ...this.#viewState,
      zoomX: nextZoom,
      zoomY: nextZoom,
      transitionDuration: 160,
      transitionInterpolator: new LinearInterpolator(["zoomX", "zoomY"]),
    });
  }

  fitToContent(): void {
    const bounds = this.#contentBounds();
    const viewport = this.#deck.getViewports()[0];
    if (!bounds || !viewport) {
      return;
    }

    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const padding = 72;
    const usableWidth = Math.max(1, viewport.width - padding * 2);
    const usableHeight = Math.max(1, viewport.height - padding * 2);
    const nextZoom = Math.log2(
      Math.min(usableWidth / width, usableHeight / height),
    );
    const minZoom =
      typeof this.#viewState.minZoom === "number"
        ? this.#viewState.minZoom
        : -12;
    const maxZoom =
      typeof this.#viewState.maxZoom === "number"
        ? this.#viewState.maxZoom
        : 24;
    const clampedZoom = Math.min(maxZoom, Math.max(minZoom, nextZoom));

    this.#applyViewState({
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

  dispose(): void {
    if (this.#viewportFrame !== null) {
      cancelAnimationFrame(this.#viewportFrame);
    }
    if (this.#viewportTimer !== null) {
      clearTimeout(this.#viewportTimer);
    }
    if (this.#entityLabelsFrame !== null) {
      cancelAnimationFrame(this.#entityLabelsFrame);
    }
    this.#unsubscribe();
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

      // The cut changed: a flat-buffer reorder (or a closed leaf) can invalidate the
      // selected index, so keep it only while it still resolves to the same entity.
      if (
        this.#selected !== null &&
        this.#handle.resolveEntityId(
          this.#selected.layoutId,
          this.#selected.localIndex,
        ) !== this.#selected.entityId
      ) {
        this.#selected = null;
      }

      // The visible cut changed: refresh the ego set (or clear it if selection was dropped).
      this.#queryEgo();

      // Structure changed (new dots, reorder, leaf open/close): recompute which dots label +
      // their text. The paired position event below rebuilds the layer from this cached set.
      this.#rebuildEntityLabelData();

      // Same gating for the per-dot type-icon keys (the only O(dots) icon-resolution scan).
      this.#rebuildEntityIconData();

      return;
    }

    this.#positionTick += 1;
    updatePlaced(this.#placed, positions);
    this.#dataLayers = this.#buildDataLayers(structure, positions);
    this.#rebuildLabels();
    this.#overlayLayers = this.#buildOverlay();
    this.#pushLayers();
    // The selected node may have moved this tick: refresh its tracked screen position.
    this.#emitSelection();
    this.#emitHighwayHover();
    this.#emitClusterHover();
    this.#scheduleEntityLabels();
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
    // (see #edgePickFor): an edge under a bubble still wins a click/hover, while a dot -- drawn on
    // top -- still wins over an edge passing under it.
    const edges = edgeLayer(positions, structure.flatGraph !== undefined);
    const edgeArrows = edgeArrowLayer(
      positions,
      viewStateZoom(this.#viewState),
    );
    if (structure.flatGraph) {
      result.push(...communityLayer(structure.flatGraph, clusters));
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
            names: this.#entityIconNames,
            namesVersion: this.#entityIconNamesVersion,
            positionTick: this.#positionTick,
            zoom: this.#iconZoomBucket / ICON_ZOOM_BUCKETS_PER_UNIT,
            zoomBucket: this.#iconZoomBucket,
          }),
        );
      }
    } else {
      result.push(...edges);
      result.push(
        clusterBubbleLayer(
          this.#placed,
          this.#positionTick,
          this.#keepFullClusters(),
          this.#highlightTick,
        ),
      );
      result.push(...edgeArrows);
      result.push(
        ...clusterEntityLayers({
          structure,
          positions,
          clusters,
          positionTick: this.#positionTick,
          highlightedEntities: this.#highlightedEntities,
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
            namesByLeaf: this.#leafIconNames,
            namesVersion: this.#entityIconNamesVersion,
            positionTick: this.#positionTick,
            zoom: this.#iconZoomBucket / ICON_ZOOM_BUCKETS_PER_UNIT,
            zoomBucket: this.#iconZoomBucket,
          }),
        );
      }
    }
    return result;
  }

  // The scrim + ego overlay, drawn over the base layers and labels: dims everything, then
  // redraws the selected node + its ego (dots, and bubbles for collapsed neighbors) bright on
  // top. Empty when nothing is selected.
  #buildOverlay(): Layer[] {
    // Just the selected node's ring (empty data when nothing is selected, so the layer set
    // stays stable). Ego neighbors are conveyed by the focus dim, not rings.
    let selected: SelectionGeometry | null = null;
    if (this.#selected !== null) {
      selected = this.#geometryOf(
        this.#selected.layoutId,
        this.#selected.localIndex,
      );
    }

    return selectionOverlayLayers(selected, this.#positionTick);
  }

  #applyViewState(viewState: ViewState): void {
    const nextZoom = viewStateZoom(viewState);
    const zoomChanged = nextZoom !== viewStateZoom(this.#viewState);
    const nextLabelZoomBucket = labelZoomBucket(nextZoom);
    const labelEligibilityChanged =
      nextLabelZoomBucket !== this.#labelZoomBucket;
    const nextIconZoomBucket = iconZoomBucket(nextZoom);
    const iconEligibilityChanged = nextIconZoomBucket !== this.#iconZoomBucket;
    this.#viewState = viewState;
    this.#labelZoomBucket = nextLabelZoomBucket;
    this.#iconZoomBucket = nextIconZoomBucket;
    this.#deck.setProps({ viewState });
    this.#scheduleViewport();
    // Cluster/edge labels fade by zoom alpha, so their cheap layer props update on zoom. Entity
    // label eligibility is the expensive O(dots) path and only changes on coarse zoom buckets.
    // GPU layer reconciliation is the expensive path. Only ZOOM needs it (screen-size LOD changes
    // which dots label + the label/edge layers); a pure pan reprojects the canvas via viewState, so
    // skip the rebuild there.
    if (zoomChanged) {
      this.#rebuildLabels();
    }
    if (labelEligibilityChanged) {
      this.#rebuildEntityLabelData();
    }
    if (iconEligibilityChanged) {
      this.#refreshDataLayers();
    } else if (zoomChanged) {
      this.#pushLayers();
    }
    // HTML overlays (selection / highway / cluster cards + hub labels) are positioned by PROJECTED
    // screen coords, so they must re-project on EVERY camera move -- pan included -- or they freeze
    // in place while the canvas slides under them. Cheap: labels are rAF-coalesced and the cards
    // update only a GPU transform (their bodies are memoized), so this is safe per drag frame.
    this.#emitSelection();
    this.#emitHighwayHover();
    this.#emitClusterHover();
    this.#scheduleEntityLabels();
  }

  #handleViewStateChange(viewState: ViewState): void {
    this.#applyViewState(viewState);
  }

  #contentBounds(): ViewBounds | null {
    const positions = this.#handle.getPositions();
    const structure = this.#handle.getStructure();
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
      const flat = this.#handle.getClusters().get(flatGraph.layoutId);
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

    const clusters = this.#handle.getClusters();
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
      const originX =
        positions.clusterPositions[layer.leafClusterIndex * 2] ?? 0;
      const originY =
        positions.clusterPositions[layer.leafClusterIndex * 2 + 1] ?? 0;
      for (let index = 0; index < ref.nodeIds.length; index++) {
        include(
          originX + leafNodeX(ref.positions, index),
          originY + leafNodeY(ref.positions, index),
          4,
        );
      }
    }

    return bounds;
  }

  #handleClick(info: PickingInfo): void {
    // Entity dot: select it (ring + focus + pinned card). Dots draw on top, so a dot pick wins
    // outright. Opening is the card's Open button (wired by the bridge).
    const picked = this.#resolvePicked(info);
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
      const linkEntityIdx = this.#pickedLinkEntityIdx(edgeInfo);
      if (linkEntityIdx !== null) {
        this.#selectLink(linkEntityIdx);
        return;
      }
      const laneId = this.#pickedHighwayLaneId(edgeInfo);
      if (laneId !== null) {
        this.#openHighwayLinks(laneId);
        return;
      }
    }
    // Cluster bubble: animate so its on-screen radius crosses the open threshold.
    const placed = info.object as PlacedCluster | undefined;
    if (placed?.cluster) {
      const targetZoom = Math.log2(Math.max(1e-3, 320 / placed.cluster.radius));
      const next: ViewState = {
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
      };
      this.#viewState = next;
      this.#deck.setProps({ viewState: next });
      return;
    }
    // Empty space: clear the selection.
    this.#select(null);
  }

  #handleHover(info: PickingInfo): void {
    if (this.#isDragging) {
      return;
    }
    // Entity dot (flat graph or an open hierarchical leaf): show its card at the cursor. Dots draw
    // on top, so a dot pick wins outright (and clears any highway summary).
    const picked = this.#resolvePicked(info);
    if (picked) {
      this.#hoveredEntity = picked.entityId;
      this.#callbacks.onEntityHover?.({
        entityId: picked.entityId,
        x: info.x,
        y: info.y,
      });
      this.#clearHighwayHover();
      this.#clearClusterHover();
      return;
    }
    // Edges render under the bubbles but still win a hover over them (#edgePickFor).
    const edgeInfo = this.#edgePickFor(info);
    if (edgeInfo) {
      // Flat edge: a link IS an entity, so show the same card for the link entity.
      const linkEntityId = this.#resolvePickedEdge(edgeInfo);
      if (linkEntityId !== null) {
        this.#hoveredEntity = linkEntityId;
        this.#callbacks.onEntityHover?.({
          entityId: linkEntityId,
          x: info.x,
          y: info.y,
        });
        this.#clearHighwayHover();
        this.#clearClusterHover();
        return;
      }
      // Hierarchical highway: a summary of the links it bundles.
      const laneId = this.#pickedHighwayLaneId(edgeInfo);
      const lane =
        laneId === null
          ? undefined
          : this.#handle.getStructure()?.highwayLanes[laneId];
      if (laneId !== null && lane && lane.count > 0) {
        this.#clearHover();
        this.#clearClusterHover();
        // Anchor the summary to the hovered point in WORLD space so it tracks the highway as the
        // camera pans / the layout settles (re-projected by #emitHighwayHover), like the pinned card.
        const world = this.#deck.getViewports()[0]?.unproject([info.x, info.y]);
        this.#hoveredHighway =
          world === undefined
            ? null
            : { laneId, worldX: world[0] ?? 0, worldY: world[1] ?? 0 };
        this.#emitHighwayHover();
        return;
      }
    }
    // Wholly-frontier cluster bubble (no dot/edge over it): offer to load its entities. Anchored to
    // the bubble (re-projected by #emitClusterHover) so the load card tracks it through pan / settle.
    const placed = info.object as PlacedCluster | undefined;
    const frontierIds = placed?.cluster.frontierEntityIds;
    if (placed && frontierIds && frontierIds.length > 0) {
      this.#clearHover();
      this.#clearHighwayHover();
      this.#hoveredClusterId = placed.cluster.id;
      this.#emitClusterHover();
      return;
    }
    this.#clearHighwayHover();
    this.#clearHover();
    this.#clearClusterHover();
  }

  /** Clear the load card (cursor left the bubble, or a dot/edge/highway took over). */
  #clearClusterHover(): void {
    if (this.#hoveredClusterId === null) {
      return;
    }
    this.#hoveredClusterId = null;
    this.#callbacks.onClusterHover?.(null);
  }

  /**
   * Re-project the hovered frontier bubble to screen and re-emit its load summary, so the card
   * tracks the bubble through a pan / settle. Called wherever {@link #emitHighwayHover} is. No-op
   * when nothing is hovered or the bubble is no longer a wholly-frontier one.
   */
  #emitClusterHover(): void {
    if (this.#hoveredClusterId === null) {
      return;
    }
    const placed = this.#placed.find(
      (entry) => entry.cluster.id === this.#hoveredClusterId,
    );
    const frontierIds = placed?.cluster.frontierEntityIds;
    const viewport = this.#deck.getViewports()[0];
    if (!placed || !frontierIds || frontierIds.length === 0 || !viewport) {
      return;
    }
    const projected = viewport.project([placed.x, placed.y]);
    const x = projected[0];
    const y = projected[1];
    if (x === undefined || y === undefined) {
      return;
    }
    this.#callbacks.onClusterHover?.({
      count: placed.cluster.count,
      frontierEntityIds: frontierIds,
      x,
      y,
      radiusPx: placed.cluster.radius * 2 ** viewStateZoom(this.#viewState),
    });
  }

  /** Clear the highway summary (cursor left it, or a dot/link took over). */
  #clearHighwayHover(): void {
    this.#hoveredHighway = null;
    this.#callbacks.onHighwayHover?.(null);
  }

  /**
   * Re-project the hovered highway's world anchor to screen and re-emit its summary, so the card
   * tracks the highway through a pan / settle. Called wherever {@link #emitSelection} is. No-op
   * when nothing is hovered.
   */
  #emitHighwayHover(): void {
    if (this.#hoveredHighway === null) {
      return;
    }
    const lane =
      this.#handle.getStructure()?.highwayLanes[this.#hoveredHighway.laneId];
    const viewport = this.#deck.getViewports()[0];
    if (!lane || lane.count === 0 || !viewport) {
      return;
    }
    const projected = viewport.project([
      this.#hoveredHighway.worldX,
      this.#hoveredHighway.worldY,
    ]);
    const x = projected[0];
    const y = projected[1];
    if (x === undefined || y === undefined) {
      return;
    }
    this.#callbacks.onHighwayHover?.({
      typeId: lane.typeId,
      typeLabel: lane.typeLabel,
      count: lane.count,
      direction: lane.direction,
      x,
      y,
    });
  }

  /**
   * The edge pick for a cursor, decoupled from render order. Edges render UNDER the cluster bubbles
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
    const overBubble =
      (info.object as PlacedCluster | undefined)?.cluster !== undefined;
    if (!overBubble) {
      return null;
    }
    return this.#deck.pickObject({
      x: info.x,
      y: info.y,
      radius: 4,
      layerIds: [...PICKABLE_EDGE_LAYER_IDS],
    });
  }

  // Map a pick on any entity-dot layer to a selection (the entity + the buffer/index it
  // resolved from, needed to read its live position). The flat tier is one whole-graph layer
  // ("flat-entities"); the hierarchical tier is one layer per open leaf, id
  // "entities:<layoutId>". The handle decodes the binary pick index against that buffer.
  #resolvePicked(info: PickingInfo): Selection | null {
    const layerId = info.layer?.id;
    if (layerId === undefined || info.index < 0) {
      return null;
    }
    const structure = this.#handle.getStructure();
    if (!structure) {
      return null;
    }
    let layoutId: ClusterId | undefined;
    if (layerId === "flat-entities") {
      layoutId = structure.flatGraph?.layoutId;
    } else if (layerId.startsWith("entities:")) {
      layoutId = structure.entityLayers.find(
        (entry) => `entities:${entry.layoutId}` === layerId,
      )?.layoutId;
    }
    if (layoutId === undefined) {
      return null;
    }
    const entityId = this.#handle.resolveEntityId(layoutId, info.index);
    return entityId === undefined
      ? null
      : { entityId, layoutId, localIndex: info.index };
  }

  // Map a pick on a flat edge lane to its link entity (a link is an entity). Bundled flat lanes and
  // hierarchical highways carry the BEZIER_NO_LINK sentinel (no single link), so they aren't
  // hoverable as entity cards.
  #resolvePickedEdge(info: PickingInfo): EntityId | null {
    const entityIdx = this.#pickedLinkEntityIdx(info);
    return entityIdx === null
      ? null
      : (this.#handle.entityIdToId(entityIdx) ?? null);
  }

  // The link's EntityIdx for a pick on a FLAT-tier edge (there beziers.ids carries the link's
  // EntityIdx). Null otherwise -- including the hierarchical tier, where the same channel carries
  // an aggregate laneId instead (see #pickedHighwayLaneId).
  #pickedLinkEntityIdx(info: PickingInfo): EntityIdx | null {
    if (
      info.layer?.id !== FLAT_EDGE_LAYER_ID ||
      info.index < 0 ||
      !this.#isFlatMode()
    ) {
      return null;
    }
    const id = this.#handle.getPositions()?.beziers.ids[info.index];
    return id === undefined || id === BEZIER_NO_LINK ? null : (id as EntityIdx);
  }

  // The aggregate lane id for a pick on a HIERARCHICAL-tier highway (there beziers.ids carries
  // the laneId). Null otherwise (flat tier / not an edge / the BEZIER_NO_LINK sentinel).
  #pickedHighwayLaneId(info: PickingInfo): number | null {
    if (
      info.layer?.id !== HIERARCHICAL_EDGE_LAYER_ID ||
      info.index < 0 ||
      this.#isFlatMode()
    ) {
      return null;
    }
    const id = this.#handle.getPositions()?.beziers.ids[info.index];
    return id === undefined || id === BEZIER_NO_LINK ? null : id;
  }

  #isFlatMode(): boolean {
    return this.#handle.getStructure()?.flatGraph !== undefined;
  }

  // Hide the hover card (the cursor left the dots, or a pan started under it).
  #clearHover(): void {
    if (this.#hoveredEntity !== null) {
      this.#hoveredEntity = null;
      this.#callbacks.onEntityHover?.(null);
    }
  }

  // Select an entity dot, or clear with null: ring + camera focus + a pinned card. The ring
  // is part of the data layers (world-space); the pinned card is React, fed the node's
  // tracked screen position via onEntitySelect.
  #select(selection: Selection | null): void {
    this.#selected = selection;
    this.#selectedLink = null;

    // A selection change un-dims immediately; the focus dim re-applies once the ego query
    // resolves -- so it never half-applies mid-resolve, and a re-query on a structure frame
    // (same selection) leaves the current dim untouched instead of flashing it off.
    this.#egoTargets = [];
    this.#highlightedEntities = new Set();

    // We force an early resolve here, so that when we re-render we don't flash the highlight off.
    // Because we immediately requery the `egoResolved` will be set to false momentarily.
    this.#highlightVersion += 1;
    this.#highlightTick = this.#highlightVersion;

    if (selection) {
      const geometry = this.#geometryOf(
        selection.layoutId,
        selection.localIndex,
      );

      if (geometry) {
        this.#focusCamera(geometry.x, geometry.y);
      }
    }

    this.#pinSelection(selection);
    this.#queryEgo();
    this.#emitSelection();
    this.#refreshDataLayers();
  }

  // Select a link edge: a pinned card (with Open) that tracks the link's midpoint -- no
  // ring/dim/ego (a link isn't a node to focus). Clears any node selection first (un-dims).
  #selectLink(linkEntityIdx: EntityIdx): void {
    this.#select(null);
    this.#selectedLink = linkEntityIdx;
    this.#emitSelection();
  }

  // Open the link entities aggregated by a highway lane in a table (the slide-stack). Async:
  // the worker maps the laneId to its link EntityIdx set; we resolve those to EntityIds.
  #openHighwayLinks(laneId: number): void {
    const onOpen = this.#callbacks.onOpenLinkTable;
    if (!onOpen) {
      return;
    }

    void this.#handle.queryHighwayLinks(laneId).then((linkEntityIdxs) => {
      const linkEntityIds: EntityId[] = [];
      for (const entityIdx of linkEntityIdxs) {
        const entityId = this.#handle.entityIdToId(entityIdx);
        if (entityId !== undefined) {
          linkEntityIds.push(entityId);
        }
      }
      if (linkEntityIds.length > 0) {
        onOpen(linkEntityIds);
      }
    });
  }

  // Pin the selected node's leaf open (hierarchical only -- the flat layout has no LOD) so it
  // stays visible as you zoom out for a birds-eye view; clear the pin on deselect.
  #pinSelection(selection: Selection | null): void {
    if (selection === null) {
      this.#handle.setPinned(null);
      return;
    }
    const cluster = this.#handle.getClusters().get(selection.layoutId);
    this.#handle.setPinned(
      cluster && cluster.flatCapacity === undefined ? selection.layoutId : null,
    );
  }

  #isEgoResolved(): boolean {
    // We always _first_ increment the highlight version, once we have the result, we flush said version to the tick. Therefore if they are the same, we know the result is fresh.
    return this.#highlightVersion === this.#highlightTick;
  }

  // Fetch + resolve the selected node's visible neighbors for ego-highlight. Async (a worker
  // round-trip); a result that lands after the selection changed is dropped.
  #queryEgo(): void {
    const selection = this.#selected;

    if (selection === null) {
      this.#handle.setHighlight([]);
      return;
    }

    const entityIdx = this.#handle.entityIdxAt(
      selection.layoutId,
      selection.localIndex,
    );

    if (entityIdx === undefined) {
      // Transient (e.g. the flat buffer reordered mid-resolve); keep the current dim and let
      // the next structure frame re-query, rather than flicker it off and back on.
      return;
    }

    // Bump the version, THEN capture it as THIS query's -- the order is load-bearing: capturing
    // before the bump leaves it one behind, so the guard below would drop even this query's own
    // result. A later query (re-select / structure re-query) bumps again, so a stale in-flight
    // result sees currentVersion !== #highlightVersion and drops; only the most recent applies.
    this.#highlightVersion += 1;
    const currentVersion = this.#highlightVersion;

    void this.#handle.queryEgo(entityIdx).then((targets) => {
      if (this.#selected !== selection) {
        return;
      }

      this.#egoTargets = this.#resolveEgoTargets(targets);
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

      this.#handle.setHighlight(highlighted);
      this.#refreshDataLayers();
    });
  }

  // Resolve the worker's ego targets to renderable refs: cluster targets pass through as a
  // bubble id; entity targets are located to their current render index across the open
  // layouts (flat or leaves), reading live record order so a reordered flat buffer is handled.
  #resolveEgoTargets(targets: readonly EgoTarget[]): EgoRef[] {
    const refs: EgoRef[] = [];
    for (const target of targets) {
      // Only collapsed-cluster neighbors are ring + keep-full targets; entity neighbors read
      // as the un-dimmed dots (the worker keeps them at full colour via the highlight set).
      if (target.kind === "cluster") {
        refs.push({ clusterId: target.clusterId });
      }
    }
    return refs;
  }

  // The clusters to keep at full colour while a selection is active (the ego's collapsed-
  // neighbor bubbles); null when nothing is selected. Every other leaf bubble recedes.
  #keepFullClusters(): ReadonlySet<ClusterId> | null {
    if (this.#selected === null || !this.#isEgoResolved()) {
      return null;
    }

    const keep = new Set<ClusterId>();
    for (const ref of this.#egoTargets) {
      keep.add(ref.clusterId);
    }
    return keep;
  }

  // Live world position + radius of a node by its layout + render index, or null if gone.
  #geometryOf(
    layoutId: ClusterId,
    localIndex: number,
  ): SelectionGeometry | null {
    const cluster = this.#handle.getClusters().get(layoutId);
    const structure = this.#handle.getStructure();
    const positions = this.#handle.getPositions();
    if (!cluster || !structure || !positions) {
      return null;
    }
    return nodeGeometry(layoutId, localIndex, cluster, structure, positions);
  }

  // World midpoint of a selected link's edge, by re-locating its bezier segment (segment order
  // changes per tick, but the link's EntityIdx is stable). null if the link isn't rendered.
  #linkMidpoint(linkEntityIdx: EntityIdx): { x: number; y: number } | null {
    const positions = this.#handle.getPositions();
    if (!positions) {
      return null;
    }
    const { ids, positions: pos } = positions.beziers;
    for (let index = 0; index < ids.length; index++) {
      if (ids[index] === linkEntityIdx) {
        // Flat links are straight cubics, so the chord midpoint (p0+p3)/2 is the visual centre.
        const base = index * 8;
        return {
          x: ((pos[base] ?? 0) + (pos[base + 6] ?? 0)) / 2,
          y: ((pos[base + 1] ?? 0) + (pos[base + 7] ?? 0)) / 2,
        };
      }
    }
    return null;
  }

  // Push the selected node's current SCREEN position to React so the pinned card tracks it
  // through settle + pan/zoom; emit null only when nothing is selected (a transient missing
  // geometry keeps the last position rather than flickering the card off).
  #emitSelection(): void {
    // The pinned card tracks a selected NODE (its dot) or a selected LINK (its edge midpoint).
    let world: { x: number; y: number } | null = null;
    let entityId: EntityId | undefined;
    if (this.#selected !== null) {
      world = this.#geometryOf(
        this.#selected.layoutId,
        this.#selected.localIndex,
      );
      entityId = this.#selected.entityId;
    } else if (this.#selectedLink !== null) {
      world = this.#linkMidpoint(this.#selectedLink);
      entityId = this.#handle.entityIdToId(this.#selectedLink);
    }
    if (world === null || entityId === undefined) {
      // Nothing selected -> clear the card; a transiently missing geometry keeps the last
      // position rather than flickering the card off.
      if (this.#selected === null && this.#selectedLink === null) {
        this.#callbacks.onEntitySelect?.(null);
      }
      return;
    }
    const viewport = this.#deck.getViewports()[0];
    if (!viewport) {
      return;
    }
    const projected = viewport.project([world.x, world.y]);
    const x = projected[0];
    const y = projected[1];
    if (x === undefined || y === undefined) {
      return;
    }
    this.#callbacks.onEntitySelect?.({ entityId, x, y });
  }

  // Ease the camera to centre a point, holding the current zoom.
  #focusCamera(x: number, y: number): void {
    const next: ViewState = {
      ...this.#viewState,
      target: [x, y, 0],
      transitionDuration: 350,
      transitionInterpolator: new LinearInterpolator(["target"]),
    };
    this.#viewState = next;
    this.#deck.setProps({ viewState: next });
  }

  // Rebuild + push the data layers against the current frames (e.g. after a selection change
  // while the layout is settled, when no position event would otherwise refresh the ring).
  #refreshDataLayers(): void {
    const structure = this.#handle.getStructure();
    const positions = this.#handle.getPositions();
    if (!structure || !positions) {
      return;
    }
    this.#dataLayers = this.#buildDataLayers(structure, positions);
    this.#overlayLayers = this.#buildOverlay();
    this.#pushLayers();
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

  #scheduleViewport(): void {
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
    this.#nextViewport.update(this.#container, this.#viewState);
    if (
      this.#hasLastViewport &&
      this.#nextViewport.equals(this.#lastViewport)
    ) {
      return;
    }
    this.#lastViewport.copyFrom(this.#nextViewport);
    this.#hasLastViewport = true;
    this.#lastViewportSentAt = performance.now();
    this.#handle.sendViewport({
      zoom: this.#lastViewport.zoom,
      center: this.#lastViewport.center,
      width: this.#lastViewport.width,
      height: this.#lastViewport.height,
    });
  }

  #rebuildLabels(): void {
    const structure = this.#handle.getStructure();
    const positions = this.#handle.getPositions();
    if (!structure || !positions) {
      return;
    }

    // Cluster + edge labels only. The entity-label layer is built fresh in #pushLayers instead,
    // so it rides the CURRENT #positionTick and tracks the settling layout (live SAB reads) --
    // #rebuildLabels only fires on zoom / structure, which would freeze labels mid-settle.
    this.#labelLayers = buildLabelLayers(
      structure,
      positions,
      viewStateZoom(this.#viewState),
      this.#positionTick,
    );
  }

  /**
   * The live world position of a labelled dot, read from the SAB via the SAME byte math the
   * selection ring uses ({@link nodeGeometry}). Called per-datum by {@link #emitEntityLabels};
   * returns null for a transiently-missing record (the set is rebuilt next zoom / structure), so
   * that label is simply skipped this frame.
   */
  #readLabelPosition(
    datum: EntityLabelDatum,
  ): readonly [number, number] | null {
    const geometry = this.#geometryOf(datum.layoutId, datum.recordIndex);
    return geometry === null ? null : [geometry.x, geometry.y];
  }

  /**
   * Project the cached hub-label set to screen and emit the on-screen ones for React to overlay as
   * HTML. Called wherever positions change (frame + view change), so the labels track the camera /
   * settle -- like {@link #emitSelection}. The SET (which hubs + text) is NOT recomputed here (that
   * is the gated {@link #rebuildEntityLabelData}); only positions re-project, bounded by the set.
   */
  #scheduleEntityLabels(): void {
    if (this.#entityLabelsFrame !== null) {
      return;
    }
    this.#entityLabelsFrame = requestAnimationFrame(() => {
      this.#entityLabelsFrame = null;
      this.#emitEntityLabels();
    });
  }

  #emitEntityLabels(): void {
    const onLabels = this.#callbacks.onEntityLabels;
    if (onLabels === undefined) {
      return;
    }
    const viewport = this.#deck.getViewports()[0];
    if (!viewport) {
      return;
    }
    const margin = ENTITY_LABEL_CULL_MARGIN_PX;
    const maxX = viewport.width + margin;
    const maxY = viewport.height + margin;
    const scale = 2 ** viewStateZoom(this.#viewState);
    const labels: EntityLabel[] = [];
    const occupied: {
      readonly left: number;
      readonly right: number;
      readonly top: number;
      readonly bottom: number;
    }[] = [];
    for (const datum of this.#entityLabelData) {
      const world = this.#readLabelPosition(datum);
      if (world === null) {
        continue;
      }
      const projected = viewport.project([world[0], world[1]]);
      const x = projected[0];
      const y = projected[1];
      if (x === undefined || y === undefined) {
        continue;
      }
      if (x < -margin || y < -margin || x > maxX || y > maxY) {
        continue;
      }
      // Anchor to the RIGHT of the dot's edge (its radius scales with zoom), left-aligned and
      // vertically centred on the dot in React -- so the label reads "● Name" and its anchor is
      // the text start, which holds steady beside the dot as the camera zooms.
      const labelX = x + datum.worldRadius * scale + ENTITY_LABEL_GAP_PX;
      const labelWidth = Math.min(
        ENTITY_LABEL_MAX_WIDTH_PX,
        datum.text.length * ENTITY_LABEL_APPROX_CHAR_WIDTH_PX + 14,
      );
      const rect = {
        left: labelX - ENTITY_LABEL_COLLISION_PADDING_PX,
        right: labelX + labelWidth + ENTITY_LABEL_COLLISION_PADDING_PX,
        top: y - ENTITY_LABEL_HEIGHT_PX / 2 - ENTITY_LABEL_COLLISION_PADDING_PX,
        bottom:
          y + ENTITY_LABEL_HEIGHT_PX / 2 + ENTITY_LABEL_COLLISION_PADDING_PX,
      };
      if (
        occupied.some(
          (other) =>
            rect.left < other.right &&
            rect.right > other.left &&
            rect.top < other.bottom &&
            rect.bottom > other.top,
        )
      ) {
        continue;
      }
      occupied.push(rect);
      labels.push({ entityId: datum.entityId, text: datum.text, x: labelX, y });
    }
    onLabels(labels);
  }

  /**
   * Recompute WHICH dots label + their text. PERF-CRITICAL: this is the only O(dots) scan and
   * the only place {@link SceneCallbacks.resolveEntityLabel} runs, and it fires ONLY on a zoom
   * or structure change -- NEVER on a pan or a position frame (those reuse the cached set and
   * just re-read positions). A dot labels once its on-screen diameter clears {@link
   * ENTITY_LABEL_MIN_SCREEN_DIAMETER}. Hierarchical leaves intentionally do not get always-on
   * hub labels; the bubble and edge labels already carry that view's orientation.
   */
  #rebuildEntityLabelData(): void {
    const resolveLabel = this.#callbacks.resolveEntityLabel;
    const structure = this.#handle.getStructure();
    if (resolveLabel === undefined || structure === undefined) {
      this.#entityLabelData = [];
      return;
    }
    const scale = 2 ** viewStateZoom(this.#viewState);
    const data: EntityLabelDatum[] = [];
    const push = (
      layoutId: ClusterId,
      recordIndex: number,
      worldRadius: number,
    ): void => {
      const entityId = this.#handle.resolveEntityId(layoutId, recordIndex);
      if (entityId === undefined) {
        return;
      }
      const text = resolveLabel(entityId);
      if (text !== undefined && text.length > 0) {
        data.push({ layoutId, recordIndex, entityId, text, worldRadius });
      }
    };

    // Flat tier: one whole-graph SAB. Each record carries its by-degree radius (the worker's
    // connectivity authority). A dot is a hub candidate when that radius marks it as connected
    // enough AND it is large enough on screen; of the candidates, only the largest few are kept so
    // the labels orient the view. (Ranking by radius, not a main-thread degree tally, is what lets
    // a node enlarged by frontier expansion still read as a hub.)
    const flatGraph = structure.flatGraph;
    if (flatGraph !== undefined) {
      const cluster = this.#handle.getClusters().get(flatGraph.layoutId);
      if (cluster !== undefined) {
        const floats = new Float32Array(cluster.versionView.buffer);
        const candidates: { index: number; radius: number }[] = [];
        for (let index = 0; index < flatGraph.count; index++) {
          const recordBase =
            (FLAT_HEADER_BYTES + index * FLAT_RECORD_BYTES) / 4;
          const radius = floats[recordBase + FLAT_RADIUS_BYTE_OFFSET / 4] ?? 0;
          if (
            radius >= HUB_LABEL_MIN_RADIUS &&
            radius * 2 * scale > ENTITY_LABEL_MIN_SCREEN_DIAMETER
          ) {
            candidates.push({ index, radius });
          }
        }
        candidates.sort((lhs, rhs) => rhs.radius - lhs.radius);
        for (const candidate of candidates.slice(0, HUB_LABEL_MAX_COUNT)) {
          push(flatGraph.layoutId, candidate.index, candidate.radius);
        }
      }
    }

    this.#entityLabelData = data;
  }

  /**
   * Recompute the per-render-index type-icon atlas KEYS for BOTH tiers (the flat whole-graph SAB
   * into {@link #entityIconNames}, and each open leaf's SAB into {@link #leafIconNames}), and ensure
   * those icons are rasterised. PERF-CRITICAL and gated EXACTLY like {@link #rebuildEntityLabelData}:
   * this is the only O(dots) icon-resolution scan and the only place
   * {@link SceneCallbacks.resolveEntityIcon} runs -- it fires ONLY on a structure / resolver change,
   * NEVER on a pan or a position frame (those reuse the cached `names` and just re-read SAB
   * positions). Every dot gets an entry (its key or null); soft-LOD sizing in the IconLayer hides
   * small ones, so there is no zoom gate here (which is also why, unlike labels, a zoom change need
   * not rebuild this).
   */
  #rebuildEntityIconData(): void {
    const resolveIcon = this.#callbacks.resolveEntityIcon;
    const structure = this.#handle.getStructure();
    if (resolveIcon === undefined || structure === undefined) {
      this.#entityIconNames = [];
      this.#leafIconNames = new Map();
      this.#entityIconNamesVersion += 1;
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
        const entityId = this.#handle.resolveEntityId(layoutId, index);
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
    this.#entityIconNames =
      flatGraph !== undefined &&
      this.#handle.getClusters().get(flatGraph.layoutId) !== undefined
        ? scanLayout(flatGraph.layoutId, flatGraph.count)
        : [];

    // Hierarchical tier: one SAB per open leaf.
    const leafNames = new Map<ClusterId, (string | null)[]>();
    for (const layer of structure.entityLayers) {
      if (this.#handle.getClusters().get(layer.layoutId) !== undefined) {
        leafNames.set(layer.layoutId, scanLayout(layer.layoutId, layer.count));
      }
    }
    this.#leafIconNames = leafNames;

    this.#entityIconNamesVersion += 1;
    // Rasterise any not-yet-known icons; emoji land synchronously, URLs resolve async and bump the
    // atlas version + re-push on load (so a still-loading icon is simply absent, then appears).
    this.#iconAtlas.ensureIcons([...keys]);
  }
}
