/**
 * Owns the graph worker connection and turns its messages into a coalesced
 * subscribe stream, split by update rate:
 * - structure events (topology / LOD cut) fire when a new StructureFrame commits;
 * - position events (cluster positions, edge geometry, entity SAB notifies) are
 * coalesced to at most one per animation frame.
 *
 * The presentation subscribes and drives Deck.gl imperatively from these events, so
 * no React state ever holds per-frame data and the layer set is never rebuilt wholesale.
 */
import { ClusterId, type EntityIndex } from "../ids";
import {
  FLAT_ENTITYIDX_BYTE_OFFSET,
  FLAT_HEADER_BYTES,
  FLAT_RECORD_BYTES,
} from "../worker/buffers/position-buffer";
import { decodeEntityId, ID_HEADER_BYTES } from "../worker/entity-id-codec";
import { configureEntityStyle } from "../worker/entity-style";

import type { VizConfig } from "../config";
import type { PositionsFrame, StructureFrame } from "../frames";
import type {
  CapturedLayoutFixture,
  EgoTarget,
  IngestEntity,
  MainToWorkerMessage,
  PropertySchemaEntry,
  TypeSchemaEntry,
  WorkerToMainMessage,
} from "../worker/protocol";
import type { EntityId } from "@blockprotocol/type-system";

const WORKER_DEBUG_LOGS_KEY = "hashGraphDebugWorkerLogs";

function workerDebugLogsEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(WORKER_DEBUG_LOGS_KEY) === "1";
}

/** A view into one open leaf's entity-position SharedArrayBuffer. */
export interface ClusterReference {
  readonly clusterId: ClusterId;
  /** Int32 version counter at byte 0; written + Atomics.notify'd by the worker. */
  readonly versionView: Int32Array;
  /** `[x0, y0, x1, y1, ...]` in the leaf's local frame. Replaced on non-SAB fallback. */
  positions: Float32Array;
  readonly nodeIds: readonly string[];
  /** Present for the flat-tier interleaved `FlatGraphBuffer`; absent for leaf SABs. */
  readonly flatCapacity?: number;
}

export interface ViewportRect {
  readonly zoom: number;
  readonly center: readonly [number, number];
  readonly width: number;
  readonly height: number;
}

export type WorkerEvent =
  | { readonly kind: "structure"; readonly frame: StructureFrame }
  | {
      readonly kind: "position";
      readonly frame: PositionsFrame;
      /**
       * Layout ids whose backing buffer was (re)allocated in this flush, so a
       * subscriber holding views over the old buffer rebinds them.
       */
      readonly replacedBuffers: readonly ClusterId[];
    };

export type WorkerListener = (event: WorkerEvent) => void;

/** The public surface the presentation drives Deck.gl from. */
export interface WorkerHandle {
  /** Latest topology, or undefined before the first structure frame. */
  getStructure(): StructureFrame | undefined;
  /** Latest cluster positions + edge geometry. */
  getPositions(): PositionsFrame | undefined;
  /** Open-leaf entity position SABs, keyed by leaf cluster id. */
  getClusters(): Map<ClusterId, ClusterReference>;
  /** Subscribe to updates. Replays current state immediately; returns unsubscribe. */
  subscribe(listener: WorkerListener): () => void;
  /** Resolve a picked entity dot to its EntityId via the id-map SAB. */
  resolveEntityId(
    layoutId: ClusterId,
    recordIndex: number,
  ): EntityId | undefined;
  /** Decode an EntityIdx to its EntityId via the id-map SAB. */
  entityIdToId(entityIdx: EntityIndex): EntityId | undefined;
  /** The raw EntityIdx (join key) for a record. */
  entityIdxAt(
    layoutId: ClusterId,
    recordIndex: number,
  ): EntityIndex | undefined;
  /** Map wanted entityIdxs to their current render indices within a layout's buffer. */
  locateRecords(
    layoutId: ClusterId,
    wanted: ReadonlySet<EntityIndex>,
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
  sendViewport(viewport: ViewportRect): void;
  registerTypes(
    typeSchemas: readonly TypeSchemaEntry[],
    propertySchemas: readonly PropertySchemaEntry[],
  ): void;
}
interface WorkerConnectionConfig {
  readonly config: VizConfig;
  readonly onReady: () => void;
  readonly onError: (message: string) => void;
}

export class WorkerConnection implements WorkerHandle {
  readonly #worker: Worker;
  readonly #onReady: () => void;
  readonly #onError: (message: string) => void;

  #structure: StructureFrame | undefined;
  #positions: PositionsFrame | undefined;
  /** Held until its paired positions frame lands, so the two commit together. */
  #pendingStructure: StructureFrame | undefined;
  readonly #clusters = new Map<ClusterId, ClusterReference>();
  /** Records-region view of the EntityIdx->EntityId join map SAB. */
  #entityIdMapBytes: Uint8Array | undefined;

  readonly #listeners = new Set<WorkerListener>();

  #batchId = 0;
  #frameId = 0;
  /** Correlates async ego queries (ego-highlight) with their replies. */
  #egoRequestId = 0;
  readonly #egoRequests = new Map<
    number,
    (targets: readonly EgoTarget[]) => void
  >();

  /** Correlates async highway-links queries (opening a highway's link table) with replies. */
  #highwayRequestId = 0;
  readonly #highwayRequests = new Map<
    number,
    (linkEntityIdxs: readonly EntityIndex[]) => void
  >();

  /** Correlates capture-live-fixture requests (debug hook) with replies. */
  #fixtureRequestId = 0;
  readonly #fixtureRequests = new Map<
    number,
    (fixture: CapturedLayoutFixture | null) => void
  >();

  #structureDirty = false;
  #positionDirty = false;
  #replacedBuffers: ClusterId[] = [];
  #flushHandle: number | undefined;

  constructor({ config, onReady, onError }: WorkerConnectionConfig) {
    this.#onReady = onReady;
    this.#onError = onError;

    // The worker installs the same style at INIT; this covers main-thread
    // consumers (hub-label radii).
    configureEntityStyle(config.entityStyle);

    this.#worker = new Worker(new URL("../worker/entry.ts", import.meta.url));
    this.#worker.onmessage = ({ data }: MessageEvent<WorkerToMainMessage>) =>
      this.#handleMessage(data);
    this.#worker.onerror = (event) => this.#onError(event.message);
    const init: MainToWorkerMessage = {
      type: "INIT",
      config: { ...config, debug: config.debug ?? workerDebugLogsEnabled() },
      typeSchemas: [],
      propertySchemas: [],
    };
    this.#worker.postMessage(init);
  }

  getStructure(): StructureFrame | undefined {
    return this.#structure;
  }

  getPositions(): PositionsFrame | undefined {
    return this.#positions;
  }

  getClusters(): Map<ClusterId, ClusterReference> {
    return this.#clusters;
  }

  subscribe(listener: WorkerListener): () => void {
    this.#listeners.add(listener);
    if (this.#structure) {
      listener({ kind: "structure", frame: this.#structure });
    }
    if (this.#positions) {
      listener({
        kind: "position",
        frame: this.#positions,
        replacedBuffers: [],
      });
    }
    return () => {
      this.#listeners.delete(listener);
    };
  }

  resolveEntityId(
    layoutId: ClusterId,
    recordIndex: number,
  ): EntityId | undefined {
    const mapBytes = this.#entityIdMapBytes;
    const cluster = this.#clusters.get(layoutId);
    if (!mapBytes || !cluster || recordIndex < 0) {
      return undefined;
    }

    // Hierarchical leaf: nodeIds[recordIndex] is the stable entityIdx string;
    // decode via the global id-map. Flat buffer: read entityIdx from the
    // live record (records reorder during ingest).
    if (cluster.flatCapacity === undefined) {
      const entityIdx = cluster.nodeIds[recordIndex];
      return entityIdx === undefined
        ? undefined
        : decodeEntityId(mapBytes, Number(entityIdx));
    }

    // Flat-tier FlatGraphBuffer: records reorder as entities stream, so read the current
    // entityIdx join key off the record itself, then decode it.
    const records = new Uint32Array(cluster.versionView.buffer);
    const slot =
      (FLAT_HEADER_BYTES +
        recordIndex * FLAT_RECORD_BYTES +
        FLAT_ENTITYIDX_BYTE_OFFSET) /
      4;
    const entityIdx = records[slot];
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
    recordIndex: number,
  ): EntityIndex | undefined {
    const cluster = this.#clusters.get(layoutId);
    if (!cluster || recordIndex < 0) {
      return undefined;
    }
    // Hierarchical leaf: nodeIds[recordIndex] IS the entityIdx (stringified). Flat: read it
    // off the record -- the same join key resolveEntityId decodes.
    if (cluster.flatCapacity === undefined) {
      const idx = cluster.nodeIds[recordIndex];
      // nodeIds entries are entityIdx decimal strings from the worker;
      // Number() is exact below 2^53.
      return idx === undefined ? undefined : (Number(idx) as EntityIndex);
    }
    const records = new Uint32Array(cluster.versionView.buffer);
    const slot =
      (FLAT_HEADER_BYTES +
        recordIndex * FLAT_RECORD_BYTES +
        FLAT_ENTITYIDX_BYTE_OFFSET) /
      4;
    return records[slot] as EntityIndex | undefined;
  }

  locateRecords(
    layoutId: ClusterId,
    wanted: ReadonlySet<EntityIndex>,
  ): Map<EntityIndex, number> {
    const result = new Map<EntityIndex, number>();
    const cluster = this.#clusters.get(layoutId);
    if (!cluster || wanted.size === 0) {
      return result;
    }
    if (cluster.flatCapacity === undefined) {
      // Hierarchical leaf: fixed node set, nodeIds[index] is the entityIdx (stringified).
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
    const records = new Uint32Array(cluster.versionView.buffer);
    const count = records[1] ?? 0;
    for (let index = 0; index < count; index++) {
      const entityIdx = records[
        (FLAT_HEADER_BYTES +
          index * FLAT_RECORD_BYTES +
          FLAT_ENTITYIDX_BYTE_OFFSET) /
          4
      ] as EntityIndex | undefined;
      if (entityIdx !== undefined && wanted.has(entityIdx)) {
        result.set(entityIdx, index);
      }
    }
    return result;
  }

  queryEgo(entityIdx: EntityIndex): Promise<readonly EgoTarget[]> {
    this.#egoRequestId += 1;
    const requestId = this.#egoRequestId;
    const message: MainToWorkerMessage = {
      type: "QUERY_EGO",
      requestId,
      entityIdx,
    };
    this.#worker.postMessage(message);
    return new Promise((resolve) => {
      this.#egoRequests.set(requestId, resolve);
    });
  }

  queryHighwayLinks(laneId: number): Promise<readonly EntityIndex[]> {
    this.#highwayRequestId += 1;
    const requestId = this.#highwayRequestId;
    const message: MainToWorkerMessage = {
      type: "QUERY_HIGHWAY_LINKS",
      requestId,
      laneId,
    };
    this.#worker.postMessage(message);
    return new Promise((resolve) => {
      this.#highwayRequests.set(requestId, resolve);
    });
  }

  captureLayoutFixture(): Promise<CapturedLayoutFixture | null> {
    this.#fixtureRequestId += 1;
    const requestId = this.#fixtureRequestId;
    const message: MainToWorkerMessage = {
      type: "CAPTURE_LAYOUT_FIXTURE",
      requestId,
    };
    this.#worker.postMessage(message);
    return new Promise((resolve) => {
      this.#fixtureRequests.set(requestId, resolve);
    });
  }

  setPinned(clusterId: ClusterId | null): void {
    const message: MainToWorkerMessage = { type: "SET_PINNED", clusterId };
    this.#worker.postMessage(message);
  }

  setHighlight(entityIdxs: readonly EntityIndex[]): void {
    const message: MainToWorkerMessage = {
      type: "SET_HIGHLIGHT",
      entityIdxs,
    };
    this.#worker.postMessage(message);
  }

  ingestBatch(entities: readonly IngestEntity[]): void {
    this.#batchId += 1;
    const message: MainToWorkerMessage = {
      type: "INGEST_BATCH",
      batchId: `batch-${this.#batchId}`,
      entities,
    };
    this.#worker.postMessage(message);
  }

  sendViewport({ zoom, center, width, height }: ViewportRect): void {
    this.#frameId += 1;
    const message: MainToWorkerMessage = {
      type: "VIEWPORT_CHANGED",
      frameId: `vp-${this.#frameId}`,
      zoom,
      center,
      width,
      height,
    };
    this.#worker.postMessage(message);
  }

  registerTypes(
    typeSchemas: readonly TypeSchemaEntry[],
    propertySchemas: readonly PropertySchemaEntry[],
  ): void {
    const message: MainToWorkerMessage = {
      type: "REGISTER_TYPES",
      typeSchemas,
      propertySchemas,
    };
    this.#worker.postMessage(message);
  }

  /** Terminates the worker, cancels pending flushes, resolves in-flight promises, and clears listeners. */
  dispose(): void {
    if (this.#flushHandle !== undefined) {
      cancelAnimationFrame(this.#flushHandle);
      this.#flushHandle = undefined;
    }
    this.#worker.terminate();
    this.#listeners.clear();
    this.#clusters.clear();
    // Resolve any in-flight ego queries so awaiters don't hang after teardown.
    for (const resolve of this.#egoRequests.values()) {
      resolve([]);
    }
    this.#egoRequests.clear();
    for (const resolve of this.#highwayRequests.values()) {
      resolve([]);
    }
    this.#highwayRequests.clear();
    for (const resolve of this.#fixtureRequests.values()) {
      resolve(null);
    }
    this.#fixtureRequests.clear();
    this.#structure = undefined;
    this.#positions = undefined;
  }

  #handleMessage(data: WorkerToMainMessage): void {
    switch (data.type) {
      case "READY":
        this.#onReady();
        break;
      case "STRUCTURE_FRAME":
        // Hold; commit with the paired positions frame so the view never sees new
        // clusters against stale positions.
        this.#pendingStructure = data.frame;
        break;
      case "POSITIONS_FRAME":
        this.#positions = data.frame;
        if (this.#pendingStructure) {
          this.#structure = this.#pendingStructure;
          this.#pendingStructure = undefined;
          this.#structureDirty = true;
        }
        this.#positionDirty = true;
        this.#scheduleFlush();
        break;
      case "ERROR":
        this.#onError(data.message);
        break;
      case "EMBEDDING_CLUSTERING_NEEDED":
        void this.#fetchEmbeddingClusters(
          data.clusterId,
          data.entityIds as string[],
          data.clusterCount,
        );
        break;
      case "LAYOUT_CREATED":
        this.#adoptClusterBuffer({
          clusterId: data.clusterId,
          buffer: data.buffer,
          nodeIds: data.nodeIds,
          flatCapacity: data.flatCapacity,
        });
        break;
      case "BUFFER_REPUBLISHED": {
        // A held SAB outgrew its in-place ceiling and was re-allocated; the bytes
        // were copied across, so keep the prior nodeIds and swap to the new buffer.
        const prev = this.#clusters.get(data.target.clusterId);
        if (prev) {
          this.#adoptClusterBuffer({
            clusterId: data.target.clusterId,
            buffer: data.buffer,
            nodeIds: prev.nodeIds,
            flatCapacity: data.capacity,
          });
        }
        break;
      }
      case "LAYOUT_POSITIONS": {
        const cluster = this.#clusters.get(data.clusterId);
        if (cluster) {
          cluster.positions = data.positions;
          this.#positionDirty = true;
          this.#scheduleFlush();
        }
        break;
      }
      case "LAYOUT_DESTROYED":
        this.#clusters.delete(data.clusterId);
        this.#positionDirty = true;
        this.#scheduleFlush();
        break;
      case "ENTITY_ID_MAP":
        // A fresh length-tracking view covers any in-place growth that follows.
        this.#entityIdMapBytes = new Uint8Array(data.buffer, ID_HEADER_BYTES);
        break;
      case "MODE_CHANGED":
        // MODE_CHANGED is informational; mode is read from StructureFrame on commit.
        break;
      case "EGO_RESULT": {
        const resolve = this.#egoRequests.get(data.requestId);
        if (resolve) {
          this.#egoRequests.delete(data.requestId);
          resolve(data.targets);
        }
        break;
      }
      case "HIGHWAY_LINKS_RESULT": {
        const resolve = this.#highwayRequests.get(data.requestId);
        if (resolve) {
          this.#highwayRequests.delete(data.requestId);
          resolve(data.linkEntityIdxs);
        }
        break;
      }
      case "LAYOUT_FIXTURE_RESULT": {
        const resolve = this.#fixtureRequests.get(data.requestId);
        if (resolve) {
          this.#fixtureRequests.delete(data.requestId);
          resolve(data.fixture);
        }
        break;
      }
    }
  }

  #adoptClusterBuffer({
    clusterId,
    buffer,
    nodeIds,
    flatCapacity,
  }: {
    readonly clusterId: ClusterId;
    readonly buffer: SharedArrayBuffer | ArrayBuffer;
    readonly nodeIds: readonly string[];
    readonly flatCapacity: number | undefined;
  }): void {
    const cluster: ClusterReference = {
      clusterId,
      versionView: new Int32Array(buffer, 0, 1),
      positions: new Float32Array(buffer, 4),
      nodeIds,
      flatCapacity,
    };
    this.#clusters.set(clusterId, cluster);
    this.#replacedBuffers.push(clusterId);
    this.#positionDirty = true;
    this.#scheduleFlush();
    this.#watchClusterBuffer(cluster, buffer);
  }

  // Re-arm an async wait on the cluster's version word; on each notify mark a
  // position flush. Self-cancels once the cluster is replaced or destroyed.
  #watchClusterBuffer(
    cluster: ClusterReference,
    buffer: SharedArrayBuffer | ArrayBuffer,
  ): void {
    if (
      typeof SharedArrayBuffer === "undefined" ||
      !(buffer instanceof SharedArrayBuffer) ||
      typeof Atomics.waitAsync !== "function"
    ) {
      return;
    }
    const arm = (currentVersion: number): void => {
      if (this.#clusters.get(cluster.clusterId) !== cluster) {
        return;
      }
      const result = Atomics.waitAsync(cluster.versionView, 0, currentVersion);
      const onChanged = (): void => {
        if (this.#clusters.get(cluster.clusterId) !== cluster) {
          return;
        }
        this.#positionDirty = true;
        this.#scheduleFlush();
        arm(Atomics.load(cluster.versionView, 0));
      };
      if (result.async) {
        void result.value.then((status) => {
          if (status === "ok") {
            onChanged();
          }
        });
      } else {
        // Version changed between load and wait ("not-equal"): re-arm immediately.
        onChanged();
      }
    };
    arm(Atomics.load(cluster.versionView, 0));
  }

  #scheduleFlush(): void {
    if (this.#flushHandle !== undefined) {
      return;
    }
    this.#flushHandle = requestAnimationFrame(() => {
      this.#flushHandle = undefined;
      this.#flush();
    });
  }

  #flush(): void {
    if (this.#structureDirty) {
      this.#structureDirty = false;
      const frame = this.#structure;
      if (frame) {
        for (const listener of this.#listeners) {
          listener({ kind: "structure", frame });
        }
      }
    }
    if (this.#positionDirty) {
      this.#positionDirty = false;
      const frame = this.#positions;
      const replacedBuffers = this.#replacedBuffers;
      this.#replacedBuffers = [];
      if (frame) {
        for (const listener of this.#listeners) {
          listener({ kind: "position", frame, replacedBuffers });
        }
      }
    }
  }

  async #fetchEmbeddingClusters(
    clusterId: string,
    entityIds: string[],
    clusterCount: number,
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
        },
      );

      if (!response.ok) {
        // eslint-disable-next-line no-console
        console.warn(
          `[embedding] clustering failed for ${clusterId}: ${response.status}`,
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

      const message: MainToWorkerMessage = {
        type: "EMBEDDING_CLUSTERING_RESULT",
        clusterId: ClusterId(clusterId),
        clusters: result.clusters,
      };
      this.#worker.postMessage(message);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[embedding] clustering request failed for ${clusterId}:`,
        err,
      );
    }
  }
}
