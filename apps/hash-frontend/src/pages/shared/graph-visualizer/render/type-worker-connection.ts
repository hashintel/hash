/**
 * The type-graph lifecycle's worker connection: boots `INIT_TYPE` and
 * implements {@link SceneHandle}<VersionedUrl> on top of
 * {@link FrameConnection}'s frame stream.
 *
 * Node keys are {@link TypeId}s, resolved to {@link VersionedUrl}s against
 * the append-only `TYPE_ID_TABLE` the worker publishes (the type-graph
 * analogue of the entity id-map SAB). Edge identity: bezier segment ids are
 * indices into the store's edge table, mirrored per structure frame as
 * {@link StructureFrame.typeEdges}, so a hovered segment resolves to its
 * source / target / link type without a worker round-trip.
 */
import {
  flatRecordJoinKey,
  FrameConnection,
  PendingRequests,
} from "./frame-connection";

import type { ClusterId, TypeId } from "../ids";
import type { TypeSchemaEntry } from "../worker/protocol";
import type {
  IngestTypeEdge,
  IngestTypeNode,
} from "../worker/type-graph/protocol";
import type {
  FrameConnectionConfig,
  LifecycleMessage,
} from "./frame-connection";
import type { FlatEdgePick, NodeEgo, SceneHandle } from "./scene/handle";
import type { VersionedUrl } from "@blockprotocol/type-system";

/** The public surface the type presentation drives Deck.gl from. */
export interface TypeWorkerHandle extends SceneHandle<VersionedUrl> {
  ingestTypes(
    nodes: readonly IngestTypeNode[],
    edges: readonly IngestTypeEdge[],
    linkTypeSchemas: readonly TypeSchemaEntry[]
  ): void;
}

export class TypeWorkerConnection
  extends FrameConnection
  implements TypeWorkerHandle
{
  /**
   * The TypeId -> VersionedUrl join table, appended from TYPE_ID_TABLE
   * messages (interning is append-only; each message carries the new tail).
   */
  readonly #typeUrls: VersionedUrl[] = [];

  /** Correlates async ego queries (ego-highlight) with their replies. */
  readonly #egoRequests = new PendingRequests<readonly TypeId[]>();

  constructor(connectionConfig: FrameConnectionConfig) {
    super(connectionConfig);
    this.send({
      type: "INIT_TYPE",
      config: this.withDebugFlag(connectionConfig.config),
    });
  }

  resolveNodeId(
    layoutId: ClusterId,
    recordIndex: number
  ): VersionedUrl | undefined {
    const typeId = this.nodeKeyAt(layoutId, recordIndex);
    return typeId === undefined ? undefined : this.#typeUrls[typeId];
  }

  nodeKeyToId(nodeKey: number): VersionedUrl | undefined {
    return this.#typeUrls[nodeKey];
  }

  nodeKeyAt(layoutId: ClusterId, recordIndex: number): TypeId | undefined {
    const cluster = this.getClusters().get(layoutId);
    if (!cluster || recordIndex < 0) {
      return undefined;
    }
    // The type lifecycle only ever publishes the flat interleaved buffer;
    // records reorder as types stream, so read the join key off the record.
    return flatRecordJoinKey(cluster, recordIndex) as TypeId | undefined;
  }

  /** An edge here is a link *type* between two type nodes, not a node itself. */
  resolveFlatEdge(edgeId: number): FlatEdgePick<VersionedUrl> | null {
    const edge = this.getStructure()?.typeEdges?.[edgeId];
    if (!edge) {
      return null;
    }
    const source = this.#typeUrls[edge.source];
    const target = this.#typeUrls[edge.target];
    const linkType = this.#typeUrls[edge.linkTypeId];
    return source === undefined ||
      target === undefined ||
      linkType === undefined
      ? null
      : { kind: "edge", source, target, linkType };
  }

  queryEgo(nodeKey: number): Promise<NodeEgo> {
    return new Promise((resolve) => {
      this.send({
        type: "QUERY_TYPE_EGO",
        requestId: this.#egoRequests.open((typeIds) => {
          // No hierarchical tier: every neighbour is an individually
          // rendered node, so the collapsed-cluster set is always empty.
          resolve({ nodeKeys: typeIds, clusterIds: [] });
        }),
        typeId: nodeKey as TypeId,
      });
    });
  }

  setHighlight(nodeKeys: readonly number[]): void {
    this.send({
      type: "SET_TYPE_HIGHLIGHT",
      typeIds: nodeKeys as readonly TypeId[],
    });
  }

  /** No hierarchical tier to pin; the scene calls this on deselect regardless. */
  setPinned(): void {}

  /** No aggregated highways in the type lifecycle; nothing to expand. */
  queryHighwayLinks(): Promise<readonly number[]> {
    return Promise.resolve([]);
  }

  ingestTypes(
    nodes: readonly IngestTypeNode[],
    edges: readonly IngestTypeEdge[],
    linkTypeSchemas: readonly TypeSchemaEntry[]
  ): void {
    this.send({ type: "INGEST_TYPES", nodes, edges, linkTypeSchemas });
  }

  /** Also resolves in-flight queries so awaiters don't hang after teardown. */
  override dispose(): void {
    super.dispose();
    this.#egoRequests.settleAll([]);
  }

  protected handleLifecycleMessage(message: LifecycleMessage): void {
    switch (message.type) {
      case "TYPE_ID_TABLE":
        // startId always equals the current length (append-only interning,
        // in-order message delivery); splice guards against a re-sent tail.
        this.#typeUrls.splice(
          message.startId,
          message.urls.length,
          ...message.urls
        );
        break;
      case "TYPE_EGO_RESULT":
        this.#egoRequests.settle(message.requestId, message.typeIds);
        break;
      default:
        // Entity-lifecycle replies never arrive on an INIT_TYPE worker.
        break;
    }
  }
}
