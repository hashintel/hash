import type { VizConfig } from "../config";
import type { PositionsFrame, StructureFrame } from "../frames";
import type { ClusterId, EntityIdx, VizMode } from "../ids";
/**
 * Message types for the worker <-> main thread boundary.
 *
 * Each message variant is its own interface so it's self-documenting,
 * individually importable, and easy to match on.
 *
 * The worker owns all heavy state. The main thread receives only:
 *  - {@link StructureFrameMessage}: identities + topology, on cut change.
 *  - {@link PositionsFrameMessage}: bounded cluster positions + edge geometry,
 *    per tick while settling.
 *  - {@link LayoutCreatedMessage} / {@link LayoutDestroyedMessage}: the
 *    `SharedArrayBuffer` lifecycle for an open leaf's entity positions.
 */
import type {
  EntityId,
  LinkData,
  PropertyObject,
  VersionedUrl,
} from "@blockprotocol/type-system";

export interface TypeSchemaEntry {
  readonly url: VersionedUrl;
  readonly title: string;
  /**
   * For a link type, its inverse (target -> source) title, e.g. "Member Of" for "Has Member".
   * Lets the worker label a reverse lane with the inverse title (a lane is per direction).
   */
  readonly inverseTitle?: string;
  readonly icon?: string;
  readonly allOfRefs: readonly VersionedUrl[];
}

/**
 * A property type's display title keyed by its base URL. Shipped alongside
 * {@link TypeSchemaEntry} so the worker can render a property-based cluster label
 * ("Destination = ...") with the human title rather than a raw base URL. The worker
 * holds property VALUES (on {@link IngestEntity}); these supply the names for them.
 */
export interface PropertySchemaEntry {
  readonly baseUrl: string;
  readonly title: string;
}

export interface IngestEntity {
  readonly entityId: EntityId;
  readonly entityTypeIds: readonly VersionedUrl[];
  readonly label?: string;
  readonly isLink: boolean;
  /**
   * Whether this entity is a query ROOT. A non-root node is a FRONTIER node (a fetched link
   * endpoint, rendered greyed-out until expanded). Carried on the ingest itself -- co-located with
   * the entity -- so it is applied the moment the entity is interned and the first render already
   * has the right colour, with no separate roots message. An expand re-sends a frontier node with
   * this set to flip it. Always false for links.
   */
  readonly isRoot: boolean;
  readonly linkData?: LinkData;
  /**
   * The entity's property values, shipped for NODE entities so the worker can name an
   * embedding cluster from the distinctive (property = value) signature its members
   * share (see {@link PropertySchemaEntry}). The worker extracts the scalar features it
   * needs itself; links carry none (they are never embedding-clustered).
   */
  readonly properties?: PropertyObject;
}

export interface InitMessage {
  readonly type: "INIT";
  readonly config: VizConfig;
  readonly typeSchemas: readonly TypeSchemaEntry[];
  readonly propertySchemas: readonly PropertySchemaEntry[];
}

export interface RegisterTypesMessage {
  readonly type: "REGISTER_TYPES";
  readonly typeSchemas: readonly TypeSchemaEntry[];
  readonly propertySchemas: readonly PropertySchemaEntry[];
}

export interface IngestBatchMessage {
  readonly type: "INGEST_BATCH";
  readonly batchId: string;
  readonly entities: readonly IngestEntity[];
}

export interface ViewportChangedMessage {
  readonly type: "VIEWPORT_CHANGED";
  readonly frameId: string;
  readonly zoom: number;
  readonly center: readonly [number, number];
  readonly width: number;
  readonly height: number;
}

export interface EmbeddingClusteringResultMessage {
  readonly type: "EMBEDDING_CLUSTERING_RESULT";
  readonly clusterId: ClusterId;
  readonly clusters: readonly {
    readonly clusterId: number;
    readonly entityIds: readonly string[];
  }[];
}

/**
 * The currently-visible representative of one of a selected node's neighbors: the entity
 * itself when it is individually rendered (the flat tier, or an open hierarchical leaf), else
 * the visible cluster bubble it is collapsed into. Drives cross-cluster ego-highlight.
 */
export type EgoTarget =
  | { readonly kind: "entity"; readonly entityIdx: EntityIdx }
  | { readonly kind: "cluster"; readonly clusterId: ClusterId };

/**
 * Ask for a selected node's ego: its neighbors' visible representatives. Async; the reply is
 * an {@link EgoResultMessage} correlated by {@link requestId}.
 */
export interface QueryEgoMessage {
  readonly type: "QUERY_EGO";
  readonly requestId: number;
  /** EntityIdx (join key) of the selected node. */
  readonly entityIdx: EntityIdx;
}

/**
 * Pin a hierarchical leaf cluster open (its ancestors too) regardless of zoom, or null to
 * clear. Set on selection; the worker forces it into the cut until cleared (birds-eye view).
 */
export interface SetPinnedMessage {
  readonly type: "SET_PINNED";
  readonly clusterId: ClusterId | null;
}

/**
 * Set the highlighted entities (a selection's ego now, a path later): the worker keeps these
 * at full colour and dims everyone else. Empty restores full colour. Generic -- the worker
 * just dims the complement; the main thread decides what the set is.
 */
export interface SetHighlightMessage {
  readonly type: "SET_HIGHLIGHT";
  readonly entityIdxs: readonly EntityIdx[];
}

/**
 * Ask which link entities a clicked highway lane aggregates. Async; the reply is
 * a {@link HighwayLinksResultMessage} correlated by {@link requestId}. The
 * {@link laneId} is the lane's index in the worker's visual-edge list, carried
 * to the main thread as the bezier segment `id` (see `RenderBezierBuffers.ids`).
 */
export interface QueryHighwayLinksMessage {
  readonly type: "QUERY_HIGHWAY_LINKS";
  readonly requestId: number;
  readonly laneId: number;
}

export type MainToWorkerMessage =
  | InitMessage
  | RegisterTypesMessage
  | IngestBatchMessage
  | ViewportChangedMessage
  | EmbeddingClusteringResultMessage
  | QueryEgoMessage
  | SetPinnedMessage
  | SetHighlightMessage
  | QueryHighwayLinksMessage;

export interface ReadyMessage {
  readonly type: "READY";
}

/**
 * Topology changed (cut/ingest). Carries identities, styles, and edge
 * topology. Sent rarely; held in a ref on the main thread with a version bump.
 */
export interface StructureFrameMessage {
  readonly type: "STRUCTURE_FRAME";
  readonly frame: StructureFrame;
}

/**
 * Positions changed (force layout tick). Carries bounded cluster positions and
 * freshly-computed edge geometry. Valid only against the latest
 * {@link StructureFrameMessage}.
 */
export interface PositionsFrameMessage {
  readonly type: "POSITIONS_FRAME";
  readonly frame: PositionsFrame;
}

export interface ModeChangedMessage {
  readonly type: "MODE_CHANGED";
  readonly oldMode: VizMode;
  readonly newMode: VizMode;
}

export interface EmbeddingClusteringNeededMessage {
  readonly type: "EMBEDDING_CLUSTERING_NEEDED";
  readonly clusterId: ClusterId;
  readonly entityIds: readonly string[];
  readonly clusterCount: number;
}

/**
 * An open leaf's entity positions are now backed by this buffer. Positions are
 * LOCAL to the leaf center (`[x0, y0, x1, y1, ...]` after a leading int32
 * version counter); the main thread adds the leaf's world position.
 */
export interface LayoutCreatedMessage {
  readonly type: "LAYOUT_CREATED";
  readonly clusterId: ClusterId;
  /** SharedArrayBuffer (or ArrayBuffer fallback) with `[version, ...positions]`. */
  readonly buffer: SharedArrayBuffer | ArrayBuffer;
  readonly nodeIds: readonly string[];
  /**
   * Present when `buffer` is a flat-tier `FlatGraphBuffer` — positions + radii +
   * colours in regions sized by this capacity, so the main thread builds all
   * three views. Absent for a positions-only entity SharedArrayBuffer.
   */
  readonly flatCapacity?: number;
}

export interface LayoutPositionsMessage {
  readonly type: "LAYOUT_POSITIONS";
  readonly clusterId: ClusterId;
  /** Copied position data. Only sent when SharedArrayBuffer is unavailable. */
  readonly positions: Float32Array;
}

export interface LayoutDestroyedMessage {
  readonly type: "LAYOUT_DESTROYED";
  readonly clusterId: ClusterId;
}

/** Which main-thread-held SharedArrayBuffer a {@link BufferRepublishedMessage}
 * replaces. A discriminated union so new growable buffers (e.g. the EntityId
 * map) slot in. */
export type RepublishTarget = {
  readonly kind: "layout";
  readonly clusterId: ClusterId;
};

/**
 * A SharedArrayBuffer the main thread holds was re-allocated: it outgrew its in-place
 * `maxByteLength` ceiling (or the platform can't grow shared buffers in place). The bytes were
 * copied across, so nothing is lost (the main thread just swaps to `buffer` and
 * re-attaches its Atomics version watcher). In-place growth sends nothing (the main thread
 * already shares the same, now-larger buffer, and its length-tracking views auto-extend);
 * this fires only on the rare re-allocation. `target` says which held buffer to replace.
 */
export interface BufferRepublishedMessage {
  readonly type: "BUFFER_REPUBLISHED";
  readonly target: RepublishTarget;
  readonly buffer: SharedArrayBuffer | ArrayBuffer;
  /** Records the new buffer can hold. */
  readonly capacity: number;
}

/**
 * The EntityIdx -> EntityId join map is backed by this SharedArrayBuffer (see worker/entity-id-buffer.ts).
 * The worker is the sole writer; the main thread reads it on demand (hover/pick) to turn a
 * rendered record's `entityIdx` back into its EntityId, so no per-entity data crosses the
 * boundary. Sent on first publish and re-sent (same `type`, new `buffer`) whenever the buffer
 * is re-allocated; in-place growth needs no message (the main thread shares the same,
 * now-larger buffer and reads it fresh each time).
 */
export interface EntityIdMapMessage {
  readonly type: "ENTITY_ID_MAP";
  readonly buffer: SharedArrayBuffer | ArrayBuffer;
  /** Entities the buffer can hold. */
  readonly capacity: number;
}

export interface ErrorMessage {
  readonly type: "ERROR";
  readonly message: string;
  readonly context?: string;
}

/**
 * Reply to {@link QueryEgoMessage}: the visible representative of each of the node's
 * neighbors ({@link EgoTarget}) -- an entity dot or the cluster it collapses into. Neighbors
 * not in the current view are omitted.
 */
export interface EgoResultMessage {
  readonly type: "EGO_RESULT";
  readonly requestId: number;
  readonly targets: readonly EgoTarget[];
}

/**
 * Reply to {@link QueryHighwayLinksMessage}: the link entities the clicked
 * highway lane aggregates, correlated by {@link requestId}. Empty when the lane
 * has no aggregate identity (an individual edge, or an out-of-range id).
 */
export interface HighwayLinksResultMessage {
  readonly type: "HIGHWAY_LINKS_RESULT";
  readonly requestId: number;
  readonly linkEntityIdxs: readonly EntityIdx[];
}

export type WorkerToMainMessage =
  | ReadyMessage
  | StructureFrameMessage
  | PositionsFrameMessage
  | ModeChangedMessage
  | EmbeddingClusteringNeededMessage
  | LayoutCreatedMessage
  | LayoutPositionsMessage
  | LayoutDestroyedMessage
  | BufferRepublishedMessage
  | EntityIdMapMessage
  | ErrorMessage
  | EgoResultMessage
  | HighwayLinksResultMessage;
