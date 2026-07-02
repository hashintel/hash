/**
 * Message protocol for the worker <-> main thread boundary.
 *
 * Three kinds of traffic share this boundary: a versioned frame stream
 * ({@link StructureFrameMessage} on topology changes, followed by
 * {@link PositionsFrameMessage} ticks that are valid only against the latest
 * structure version), a side channel for shared-buffer lifecycle and the
 * entity-id lookup table ({@link LayoutSideChannelMessage}), and
 * request/response pairs correlated by `requestId` (e.g.
 * {@link QueryEgoMessage} / {@link EgoResultMessage}).
 */

import type { VizConfig } from "../config";
import type { PositionsFrame, StructureFrame } from "../frames";
import type { ClusterId, EntityIndex, VizMode } from "../ids";
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
  | { readonly kind: "entity"; readonly entityIdx: EntityIndex }
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
  readonly entityIdx: EntityIndex;
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
  readonly entityIdxs: readonly EntityIndex[];
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

/**
 * Debug hook: serializes the live flat-tier layout (positions, radii,
 * deduped edges, Louvain labels) for deterministic bench replay via
 * {@link CapturedLayoutFixture}.
 *
 * Reply: {@link LayoutFixtureResultMessage}, correlated by {@link requestId}.
 */
export interface CaptureLayoutFixtureMessage {
  readonly type: "CAPTURE_LAYOUT_FIXTURE";
  readonly requestId: number;
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
  | QueryHighwayLinksMessage
  | CaptureLayoutFixtureMessage;

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
 *
 * The main thread must drop ticks whose structure version is stale; the
 * worker never interleaves a structure commit and a position tick for the
 * same version.
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
 * An open leaf's entity positions live in this shared buffer.
 *
 * Positions are local to the leaf center: `[version_i32, x0, y0, x1, y1, ...]`.
 * The worker is the sole writer of both the version and the positions; the
 * main thread reads only after observing the version change, via Atomics or
 * message ordering.
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
 * EntityIdx to EntityId lookup table in a shared buffer.
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

/**
 * Out-of-band worker-to-main messages for shared-buffer lifecycle and
 * entity-id lookup, not tied to frame versions.
 */
export type LayoutSideChannelMessage =
  | LayoutCreatedMessage
  | LayoutDestroyedMessage
  | LayoutPositionsMessage
  | BufferRepublishedMessage
  | EntityIdMapMessage;

/**
 * Posted when worker construction, type registration, or a handler throws;
 * the worker stays alive but may be partially initialized.
 */
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
  readonly linkEntityIdxs: readonly EntityIndex[];
}

/**
 * A live layout graph serialized for replay as a bench/test fixture (see
 * {@link CaptureLayoutFixtureMessage}). Plain JSON: node ids are the layout's
 * opaque node ids, edges reference them, `communities[i]` labels `nodes[i]`.
 */
export interface CapturedLayoutFixture {
  /** ISO capture timestamp (metadata only; replay ignores it). */
  readonly capturedAt: string;
  readonly nodes: readonly {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly radius: number;
  }[];
  readonly edges: readonly {
    readonly source: string;
    readonly target: string;
    readonly weight: number;
  }[];
  /** Louvain community per node, parallel to {@link nodes} (-1 = unassigned). */
  readonly communities: readonly number[];
}

/**
 * Reply to {@link CaptureLayoutFixtureMessage}. `fixture` is null when no
 * flat-tier layout is live (hierarchical mode or an empty graph).
 */
export interface LayoutFixtureResultMessage {
  readonly type: "LAYOUT_FIXTURE_RESULT";
  readonly requestId: number;
  readonly fixture: CapturedLayoutFixture | null;
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
  | HighwayLinksResultMessage
  | LayoutFixtureResultMessage;
