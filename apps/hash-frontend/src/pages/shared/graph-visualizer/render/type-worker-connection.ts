/**
 * The type-graph lifecycle's worker connection: boots `INIT_TYPE` and adds
 * the type-specific surface on top of {@link FrameConnection}'s frame stream.
 *
 * Node identity is a {@link TypeId} join key in the flat buffer, resolved to
 * a {@link VersionedUrl} against the append-only `TYPE_ID_TABLE` the worker
 * publishes (the type-graph analogue of the entity id-map SAB). Edge
 * identity: bezier segment ids are indices into the store's edge table,
 * mirrored per structure frame as {@link StructureFrame.typeEdges}, so a
 * hovered segment resolves to its source / target / link type without a
 * worker round-trip.
 */
import {
  flatRecordJoinKey,
  FrameConnection,
  locateFlatRecords,
  PendingRequests,
} from "./frame-connection";

import type { RenderTypeEdge } from "../frames";
import type { ClusterId, TypeId } from "../ids";
import type { TypeSchemaEntry } from "../worker/protocol";
import type {
  IngestTypeEdge,
  IngestTypeNode,
} from "../worker/type-graph/protocol";
import type {
  FrameConnectionConfig,
  FrameHandle,
  LifecycleMessage,
} from "./frame-connection";
import type { VersionedUrl } from "@blockprotocol/type-system";

/** The public surface the type presentation drives Deck.gl from. */
export interface TypeWorkerHandle extends FrameHandle {
  /** Resolve a picked type dot to its VersionedUrl via the id table. */
  resolveTypeUrl(
    layoutId: ClusterId,
    recordIndex: number
  ): VersionedUrl | undefined;
  /** Decode a TypeId to its VersionedUrl via the id table. */
  typeIdToUrl(typeId: TypeId): VersionedUrl | undefined;
  /** The raw TypeId (join key) for a record. */
  typeIdAt(layoutId: ClusterId, recordIndex: number): TypeId | undefined;
  /** Map wanted TypeIds to their current render indices within the layout's buffer. */
  locateRecords(
    layoutId: ClusterId,
    wanted: ReadonlySet<TypeId>
  ): Map<TypeId, number>;
  /** Resolve a picked edge segment (its id) to source / target / link type. */
  resolveFlatEdge(edgeIdx: number): RenderTypeEdge | undefined;
  /** Ask the worker for a selected type node's neighbours. */
  queryEgo(typeId: TypeId): Promise<readonly TypeId[]>;
  /** Highlight type nodes (selection ego); empty restores full colour. */
  setHighlight(typeIds: readonly TypeId[]): void;
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

  resolveTypeUrl(
    layoutId: ClusterId,
    recordIndex: number
  ): VersionedUrl | undefined {
    const typeId = this.typeIdAt(layoutId, recordIndex);
    return typeId === undefined ? undefined : this.#typeUrls[typeId];
  }

  typeIdToUrl(typeId: TypeId): VersionedUrl | undefined {
    return this.#typeUrls[typeId];
  }

  typeIdAt(layoutId: ClusterId, recordIndex: number): TypeId | undefined {
    const cluster = this.getClusters().get(layoutId);
    if (!cluster || recordIndex < 0) {
      return undefined;
    }
    // The type lifecycle only ever publishes the flat interleaved buffer;
    // records reorder as types stream, so read the join key off the record.
    return flatRecordJoinKey(cluster, recordIndex) as TypeId | undefined;
  }

  locateRecords(
    layoutId: ClusterId,
    wanted: ReadonlySet<TypeId>
  ): Map<TypeId, number> {
    const cluster = this.getClusters().get(layoutId);
    if (!cluster || wanted.size === 0) {
      return new Map();
    }
    return locateFlatRecords(cluster, wanted);
  }

  resolveFlatEdge(edgeIdx: number): RenderTypeEdge | undefined {
    return this.getStructure()?.typeEdges?.[edgeIdx];
  }

  queryEgo(typeId: TypeId): Promise<readonly TypeId[]> {
    return new Promise((resolve) => {
      this.send({
        type: "QUERY_TYPE_EGO",
        requestId: this.#egoRequests.open(resolve),
        typeId,
      });
    });
  }

  setHighlight(typeIds: readonly TypeId[]): void {
    this.send({ type: "SET_TYPE_HIGHLIGHT", typeIds });
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
