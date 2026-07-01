/** Message protocol for the worker <-> main thread boundary. */

import type { VizConfig } from "../config";
import type { PositionsFrame, StructureFrame } from "../frames";
import type { ClusterId, EntityIdx, VizMode } from "../ids";
import type {
  EntityId,
  LinkData,
  PropertyObject,
  VersionedUrl,
} from "@blockprotocol/type-system";

export interface TypeSchemaEntry {
  readonly url: VersionedUrl;
  readonly title: string;
  /** For a link type, the inverse (target -> source) title, e.g. "Member Of" for "Has Member". */
  readonly inverseTitle?: string;
  readonly icon?: string;
  readonly allOfRefs: readonly VersionedUrl[];
}

/** A property type's human-readable title, keyed by base URL. */
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
   * Whether this entity is a query root. Non-root nodes are frontier nodes
   * (fetched link endpoints, rendered greyed-out until expanded).
   *
   * Always false for links.
   */
  readonly isRoot: boolean;
  readonly linkData?: LinkData;
  /** Property values for node entities. Absent for links. */
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
 * The currently visible representative of a selected node's neighbor: the entity
 * itself when individually rendered, or the cluster bubble it is collapsed into.
 */
export type EgoTarget =
  | { readonly kind: "entity"; readonly entityIdx: EntityIdx }
  | { readonly kind: "cluster"; readonly clusterId: ClusterId };

/**
 * Request a selected node's ego: its neighbors' visible representatives.
 *
 * Reply: {@link EgoResultMessage}, correlated by {@link requestId}.
 */
export interface QueryEgoMessage {
  readonly type: "QUERY_EGO";
  readonly requestId: number;
  /** EntityIdx (join key) of the selected node. */
  readonly entityIdx: EntityIdx;
}

/**
 * Pin a hierarchical leaf cluster open (and its ancestors) regardless of zoom,
 * or `null` to clear.
 */
export interface SetPinnedMessage {
  readonly type: "SET_PINNED";
  readonly clusterId: ClusterId | null;
}

/**
 * Set the highlighted entities. All others are dimmed.
 *
 * Empty restores full colour.
 */
export interface SetHighlightMessage {
  readonly type: "SET_HIGHLIGHT";
  readonly entityIdxs: readonly EntityIdx[];
}

/**
 * Request the link entities a highway lane aggregates.
 *
 * Reply: {@link HighwayLinksResultMessage}, correlated by {@link requestId}.
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
 * Topology changed (cut or ingest). Carries identities, styles, and edge topology.
 *
 * Sent infrequently relative to {@link PositionsFrameMessage}.
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
 * An open leaf's entity positions are now backed by this buffer.
 *
 * Positions are local to the leaf center: `[version_i32, x0, y0, x1, y1, ...]`.
 */
export interface LayoutCreatedMessage {
  readonly type: "LAYOUT_CREATED";
  readonly clusterId: ClusterId;
  readonly buffer: SharedArrayBuffer | ArrayBuffer;
  readonly nodeIds: readonly string[];
  /**
   * Present when `buffer` is a flat-tier `FlatGraphBuffer` (positions + radii +
   * colours in regions sized by this capacity). Absent for a positions-only buffer.
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

/** Identifies which shared buffer a {@link BufferRepublishedMessage} replaces. */
export type RepublishTarget = {
  readonly kind: "layout";
  readonly clusterId: ClusterId;
};

/**
 * A shared buffer was re-allocated (outgrew its `maxByteLength` ceiling, or the
 * platform cannot grow shared buffers in place). All bytes are preserved.
 *
 * Only sent on re-allocation; in-place growth requires no message.
 */
export interface BufferRepublishedMessage {
  readonly type: "BUFFER_REPUBLISHED";
  readonly target: RepublishTarget;
  readonly buffer: SharedArrayBuffer | ArrayBuffer;
  /** Records the new buffer can hold. */
  readonly capacity: number;
}

/**
 * The EntityIdx to EntityId lookup table, backed by a shared buffer.
 *
 * The worker is the sole writer. Sent on first publish and re-sent on
 * re-allocation; in-place growth needs no message.
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
 * Reply to {@link QueryEgoMessage}.
 *
 * Neighbors not in the current view are omitted.
 */
export interface EgoResultMessage {
  readonly type: "EGO_RESULT";
  readonly requestId: number;
  readonly targets: readonly EgoTarget[];
}

/**
 * Reply to {@link QueryHighwayLinksMessage}.
 *
 * Empty when the lane has no aggregate identity (individual edge or out-of-range id).
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
