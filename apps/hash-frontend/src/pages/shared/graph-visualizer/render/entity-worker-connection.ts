/**
 * The entity-graph lifecycle's worker connection: boots `INIT_ENTITY` and adds
 * the entity-specific surface on top of {@link FrameConnection}'s frame
 * stream -- EntityIdx <-> EntityId resolution via the id-map SAB, ingest and
 * type registration, ego / highway / fixture queries, pin and highlight, and
 * the embedding-clustering fetch round-trip.
 */
import { ClusterId, type EntityIndex } from "../ids";
import { decodeEntityId, ID_HEADER_BYTES } from "../worker/entity-id-codec";
import {
  flatRecordJoinKey,
  FrameConnection,
  locateFlatRecords,
  PendingRequests,
} from "./frame-connection";

import type {
  CapturedLayoutFixture,
  EgoTarget,
  IngestEntity,
  PropertySchemaEntry,
  TypeSchemaEntry,
} from "../worker/protocol";
import type {
  FrameConnectionConfig,
  FrameHandle,
  LifecycleMessage,
} from "./frame-connection";
import type { EntityId } from "@blockprotocol/type-system";

/** The public surface the entity presentation drives Deck.gl from. */
export interface WorkerHandle extends FrameHandle {
  /** Resolve a picked entity dot to its EntityId via the id-map SAB. */
  resolveEntityId(
    layoutId: ClusterId,
    recordIndex: number
  ): EntityId | undefined;
  /** Decode an EntityIdx to its EntityId via the id-map SAB. */
  entityIdToId(entityIdx: EntityIndex): EntityId | undefined;
  /** The raw EntityIdx (join key) for a record. */
  entityIdxAt(
    layoutId: ClusterId,
    recordIndex: number
  ): EntityIndex | undefined;
  /** Map wanted entityIdxs to their current render indices within a layout's buffer. */
  locateRecords(
    layoutId: ClusterId,
    wanted: ReadonlySet<EntityIndex>
  ): Map<EntityIndex, number>;
  /** Ask the worker for a selected node's ego (its neighbors' visible representatives). */
  queryEgo(entityIdx: EntityIndex): Promise<readonly EgoTarget[]>;
  /** Ask the worker for the link entities aggregated by a highway lane (its `laneId`). */
  queryHighwayLinks(laneId: number): Promise<readonly EntityIndex[]>;
  /**
   * capture-live-fixture debug hook: serialize the live flat-tier layout graph
   * for replay as a bench/test fixture. Null when no flat layout is live.
   */
  captureLayoutFixture(): Promise<CapturedLayoutFixture | null>;
  /** Pin a hierarchical leaf open (with ancestors) regardless of zoom, or null to clear. */
  setPinned(clusterId: ClusterId | null): void;
  /** Highlight entities (selection ego now, path later); empty restores full colour. */
  setHighlight(entityIdxs: readonly EntityIndex[]): void;
  ingestBatch(entities: readonly IngestEntity[]): void;
  registerTypes(
    typeSchemas: readonly TypeSchemaEntry[],
    propertySchemas: readonly PropertySchemaEntry[]
  ): void;
}

export class EntityWorkerConnection
  extends FrameConnection
  implements WorkerHandle
{
  /** Records-region view of the EntityIdx->EntityId join map SAB. */
  #entityIdMapBytes: Uint8Array | undefined;

  #batchId = 0;
  /** Correlates async ego queries (ego-highlight) with their replies. */
  readonly #egoRequests = new PendingRequests<readonly EgoTarget[]>();
  /** Correlates async highway-links queries (opening a highway's link table) with replies. */
  readonly #highwayRequests = new PendingRequests<readonly EntityIndex[]>();
  /** Correlates capture-live-fixture requests (debug hook) with replies. */
  readonly #fixtureRequests =
    new PendingRequests<CapturedLayoutFixture | null>();

  constructor(connectionConfig: FrameConnectionConfig) {
    super(connectionConfig);
    this.send({
      type: "INIT_ENTITY",
      config: this.withDebugFlag(connectionConfig.config),
      typeSchemas: [],
      propertySchemas: [],
    });
  }

  resolveEntityId(
    layoutId: ClusterId,
    recordIndex: number
  ): EntityId | undefined {
    const mapBytes = this.#entityIdMapBytes;
    if (!mapBytes) {
      return undefined;
    }
    const entityIdx = this.entityIdxAt(layoutId, recordIndex);
    return entityIdx === undefined
      ? undefined
      : decodeEntityId(mapBytes, entityIdx);
  }

  entityIdToId(entityIdx: EntityIndex): EntityId | undefined {
    const mapBytes = this.#entityIdMapBytes;
    return mapBytes === undefined
      ? undefined
      : decodeEntityId(mapBytes, entityIdx);
  }

  entityIdxAt(
    layoutId: ClusterId,
    recordIndex: number
  ): EntityIndex | undefined {
    const cluster = this.getClusters().get(layoutId);
    if (!cluster || recordIndex < 0) {
      return undefined;
    }
    // Hierarchical leaf: nodeIds[recordIndex] IS the entityIdx (stringified).
    // Flat-tier FlatGraphBuffer: records reorder as entities stream, so read
    // the current entityIdx join key off the record itself.
    if (cluster.flatCapacity === undefined) {
      const idx = cluster.nodeIds[recordIndex];
      // nodeIds entries are entityIdx decimal strings from the worker;
      // Number() is exact below 2^53.
      return idx === undefined ? undefined : (Number(idx) as EntityIndex);
    }
    return flatRecordJoinKey(cluster, recordIndex) as EntityIndex | undefined;
  }

  locateRecords(
    layoutId: ClusterId,
    wanted: ReadonlySet<EntityIndex>
  ): Map<EntityIndex, number> {
    const cluster = this.getClusters().get(layoutId);
    if (!cluster || wanted.size === 0) {
      return new Map();
    }
    if (cluster.flatCapacity === undefined) {
      // Hierarchical leaf: fixed node set, nodeIds[index] is the entityIdx (stringified).
      const result = new Map<EntityIndex, number>();
      for (let index = 0; index < cluster.nodeIds.length; index++) {
        const raw = cluster.nodeIds[index];
        if (raw === undefined) {
          continue;
        }
        const entityIdx = Number(raw) as EntityIndex;
        if (wanted.has(entityIdx)) {
          result.set(entityIdx, index);
        }
      }
      return result;
    }
    // Flat buffer: records reorder, so scan the live records for the wanted entityIdxs.
    return locateFlatRecords(cluster, wanted);
  }

  queryEgo(entityIdx: EntityIndex): Promise<readonly EgoTarget[]> {
    return new Promise((resolve) => {
      this.send({
        type: "QUERY_EGO",
        requestId: this.#egoRequests.open(resolve),
        entityIdx,
      });
    });
  }

  queryHighwayLinks(laneId: number): Promise<readonly EntityIndex[]> {
    return new Promise((resolve) => {
      this.send({
        type: "QUERY_HIGHWAY_LINKS",
        requestId: this.#highwayRequests.open(resolve),
        laneId,
      });
    });
  }

  captureLayoutFixture(): Promise<CapturedLayoutFixture | null> {
    return new Promise((resolve) => {
      this.send({
        type: "CAPTURE_LAYOUT_FIXTURE",
        requestId: this.#fixtureRequests.open(resolve),
      });
    });
  }

  setPinned(clusterId: ClusterId | null): void {
    this.send({ type: "SET_PINNED", clusterId });
  }

  setHighlight(entityIdxs: readonly EntityIndex[]): void {
    this.send({ type: "SET_HIGHLIGHT", entityIdxs });
  }

  ingestBatch(entities: readonly IngestEntity[]): void {
    this.#batchId += 1;
    this.send({
      type: "INGEST_BATCH",
      batchId: `batch-${this.#batchId}`,
      entities,
    });
  }

  registerTypes(
    typeSchemas: readonly TypeSchemaEntry[],
    propertySchemas: readonly PropertySchemaEntry[]
  ): void {
    this.send({ type: "REGISTER_TYPES", typeSchemas, propertySchemas });
  }

  /** Also resolves in-flight queries so awaiters don't hang after teardown. */
  override dispose(): void {
    super.dispose();
    this.#egoRequests.settleAll([]);
    this.#highwayRequests.settleAll([]);
    this.#fixtureRequests.settleAll(null);
  }

  protected handleLifecycleMessage(message: LifecycleMessage): void {
    switch (message.type) {
      case "ENTITY_ID_MAP":
        // A fresh length-tracking view covers any in-place growth that follows.
        this.#entityIdMapBytes = new Uint8Array(
          message.buffer,
          ID_HEADER_BYTES
        );
        break;
      case "EMBEDDING_CLUSTERING_NEEDED":
        void this.#fetchEmbeddingClusters(
          message.clusterId,
          message.entityIds as string[],
          message.clusterCount
        );
        break;
      case "EGO_RESULT":
        this.#egoRequests.settle(message.requestId, message.targets);
        break;
      case "HIGHWAY_LINKS_RESULT":
        this.#highwayRequests.settle(message.requestId, message.linkEntityIdxs);
        break;
      case "LAYOUT_FIXTURE_RESULT":
        this.#fixtureRequests.settle(message.requestId, message.fixture);
        break;
      case "MODE_CHANGED":
        // Informational; mode is read from StructureFrame on commit.
        break;
      default:
        // Type-lifecycle replies never arrive on an INIT_ENTITY worker.
        break;
    }
  }

  async #fetchEmbeddingClusters(
    clusterId: string,
    entityIds: string[],
    clusterCount: number
  ): Promise<void> {
    try {
      const apiOrigin =
        process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:5001";
      const response = await fetch(
        `${apiOrigin}/entities/embeddings/clusters`,
        {
          method: "POST",
          // Send the Kratos session cookie so hash-api resolves the authenticated
          // actor; without this the request is treated as the public actor and the
          // graph filters out every entity the user is allowed to view.
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityIds, clusterCount, dimension: 256 }),
        }
      );

      if (!response.ok) {
        // eslint-disable-next-line no-console
        console.warn(
          `[embedding] clustering failed for ${clusterId}: ${response.status}`
        );
        return;
      }

      const result = (await response.json()) as {
        clusters: {
          clusterId: number;
          entityIds: string[];
        }[];
        missingEmbeddings: string[];
      };

      this.send({
        type: "EMBEDDING_CLUSTERING_RESULT",
        clusterId: ClusterId(clusterId),
        clusters: result.clusters,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[embedding] clustering request failed for ${clusterId}:`,
        err
      );
    }
  }
}
