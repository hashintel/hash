/**
 * Messages specific to the type-graph lifecycle ({@link "./worker"}). The
 * worker entry point accepts these alongside the lifecycle-neutral messages
 * from {@link "../protocol"} (`UPDATE_CONFIG`, `SET_SIMULATION_PAUSED`);
 * frames and shared-buffer side messages reuse the shared shapes, so the
 * render pipeline consumes both lifecycles identically.
 *
 * Node identity: type nodes are keyed by {@link TypeId} (the worker's
 * VersionedUrl interning, shared with type registration). The worker owns
 * the interner and publishes the id -> url table via
 * {@link TypeIdTableMessage}; urls appear in messages only where the main
 * thread genuinely speaks urls (ingest).
 */
import type { VizConfig } from "../../config";
import type { TypeId } from "../../ids";
import type {
  SetSimulationPausedMessage,
  TypeSchemaEntry,
  UpdateConfigMessage,
} from "../protocol";
import type { VersionedUrl } from "@blockprotocol/type-system";

/**
 * The slice of {@link VizConfig} the type-graph lifecycle reads: the two
 * flat layout engines and their switch-over thresholds, node/edge styling,
 * seeding geometry, and diagnostics. A full VizConfig is assignable, so
 * main-thread callers can pass their config through unchanged.
 */
export type TypeGraphConfig = Pick<
  VizConfig,
  | "flatLayoutMaxNodes"
  | "flatLayoutExitNodes"
  | "flatForce"
  | "majorization"
  | "entityStyle"
  | "stability"
  | "debug"
>;

/**
 * One type node. Extends the schema shape so the same object registers into
 * the worker's {@link "../store/type-registry"} (colour families from
 * `allOfRefs` inheritance roots).
 *
 * `isLoaded: false` marks a frontier node: a type referenced by an edge but
 * not itself fetched yet (e.g. a remote type). Frontier nodes render grey;
 * re-ingesting the node with `isLoaded: true` (and its real `allOfRefs`)
 * upgrades it in place.
 */
export interface IngestTypeNode extends TypeSchemaEntry {
  readonly isLoaded: boolean;
}

/** One directed type edge: a link type connecting a source to a target type. */
export interface IngestTypeEdge {
  readonly sourceUrl: VersionedUrl;
  readonly targetUrl: VersionedUrl;
  readonly linkTypeUrl: VersionedUrl;
}

/** Boot the type-graph lifecycle ({@link "./worker"}) in this worker. */
export interface InitTypeMessage {
  readonly type: "INIT_TYPE";
  readonly config: TypeGraphConfig;
}

/**
 * Add type nodes and edges. Both are idempotent (per url, per
 * source/target/link-type triple), so re-sending overlapping batches is
 * safe; an edge endpoint never ingested as a node is auto-added as a
 * frontier node.
 *
 * `linkTypeSchemas` registers the link types the edges reference (they are
 * edges here, never nodes) so each gets a stable colour slot; without a
 * registered schema an edge falls back to neutral grey.
 */
export interface IngestTypesMessage {
  readonly type: "INGEST_TYPES";
  readonly nodes: readonly IngestTypeNode[];
  readonly edges: readonly IngestTypeEdge[];
  readonly linkTypeSchemas: readonly TypeSchemaEntry[];
}

/**
 * Set the highlighted type nodes; all others (and edges not fully inside the
 * set) dim. Empty restores full colour.
 */
export interface SetTypeHighlightMessage {
  readonly type: "SET_TYPE_HIGHLIGHT";
  readonly typeIds: readonly TypeId[];
}

/**
 * Request a selected type node's neighbours.
 *
 * Reply: {@link TypeEgoResultMessage}, correlated by {@link requestId}.
 */
export interface QueryTypeEgoMessage {
  readonly type: "QUERY_TYPE_EGO";
  readonly requestId: number;
  readonly typeId: TypeId;
}

export type MainToTypeWorkerMessage =
  | InitTypeMessage
  | IngestTypesMessage
  | SetTypeHighlightMessage
  | QueryTypeEgoMessage
  | UpdateConfigMessage
  | SetSimulationPausedMessage;

/**
 * The `TypeId -> VersionedUrl` join table: `urls[i]` is the url interned as
 * `TypeId(startId + i)`. Interning is append-only, so each message carries
 * only the new tail; the main thread appends into its own array and resolves
 * the u32 join keys in the flat node buffer (and {@link TypeEgoResultMessage}
 * ids) against it. Strings are variable-length, so unlike the entity-id map
 * this table travels by message, not a shared buffer -- at type-graph scale
 * (hundreds) that is negligible.
 */
export interface TypeIdTableMessage {
  readonly type: "TYPE_ID_TABLE";
  readonly startId: TypeId;
  readonly urls: readonly VersionedUrl[];
}

/** Reply to {@link QueryTypeEgoMessage}: the neighbours' TypeIds. */
export interface TypeEgoResultMessage {
  readonly type: "TYPE_EGO_RESULT";
  readonly requestId: number;
  readonly typeIds: readonly TypeId[];
}
