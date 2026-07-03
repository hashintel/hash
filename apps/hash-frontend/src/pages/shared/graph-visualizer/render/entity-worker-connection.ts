/**
 * The entity-graph lifecycle's worker connection: boots `INIT_ENTITY` and
 * implements {@link SceneHandle}<EntityId> on top of {@link FrameConnection}'s
 * frame stream -- EntityIdx <-> EntityId resolution via the id-map SAB, ingest
 * and type registration, ego / highway / fixture queries, pin and highlight,
 * and the embedding-clustering fetch round-trip.
 *
 * Node keys are {@link EntityIndex}es: the scene passes them around as plain
 * numbers (see {@link "./scene/handle"}); this connection brands them at the
 * protocol boundary.
 */
import { ClusterId, type EntityIndex } from "../ids";
import { decodeEntityId, ID_HEADER_BYTES } from "../worker/entity-id-codec";
import {
  flatRecordJoinKey,
  FrameConnection,
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
  LifecycleMessage,
} from "./frame-connection";
import type { FlatEdgePick, NodeEgo, SceneHandle } from "./scene/handle";
import type { EntityId } from "@blockprotocol/type-system";

/** The public surface the entity presentation drives Deck.gl from. */
export interface WorkerHandle extends SceneHandle<EntityId> {
  /**
   * capture-live-fixture debug hook: serialize the live flat-tier layout graph
   * for replay as a bench/test fixture. Null when no flat layout is live.
   */
  captureLayoutFixture(): Promise<CapturedLayoutFixture | null>;
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

  resolveNodeId(
    layoutId: ClusterId,
    recordIndex: number
  ): EntityId | undefined {
    const entityIdx = this.nodeKeyAt(layoutId, recordIndex);
    return entityIdx === undefined ? undefined : this.nodeKeyToId(entityIdx);
  }

  nodeKeyToId(nodeKey: number): EntityId | undefined {
    const mapBytes = this.#entityIdMapBytes;
    return mapBytes === undefined
      ? undefined
      : decodeEntityId(mapBytes, nodeKey as EntityIndex);
  }

  nodeKeyAt(layoutId: ClusterId, recordIndex: number): EntityIndex | undefined {
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

  /** A flat edge IS a link entity here: its bezier id is the link's EntityIdx. */
  resolveFlatEdge(edgeId: number): FlatEdgePick<EntityId> | null {
    const nodeId = this.nodeKeyToId(edgeId);
    return nodeId === undefined ? null : { kind: "node", nodeId };
  }

  queryEgo(nodeKey: number): Promise<NodeEgo> {
    return new Promise((resolve) => {
      this.send({
        type: "QUERY_EGO",
        requestId: this.#egoRequests.open((targets) => {
          // Split the worker's visible-representative targets into scene
          // currency: individually rendered neighbours vs collapsed bubbles.
          const nodeKeys: number[] = [];
          const clusterIds: ClusterId[] = [];
          for (const target of targets) {
            if (target.kind === "entity") {
              nodeKeys.push(target.entityIdx);
            } else {
              clusterIds.push(target.clusterId);
            }
          }
          resolve({ nodeKeys, clusterIds });
        }),
        entityIdx: nodeKey as EntityIndex,
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

  setHighlight(nodeKeys: readonly number[]): void {
    this.send({
      type: "SET_HIGHLIGHT",
      entityIdxs: nodeKeys as readonly EntityIndex[],
    });
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
