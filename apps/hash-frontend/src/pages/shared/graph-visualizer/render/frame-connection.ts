/**
 * The lifecycle-neutral half of a graph worker connection: spawns the worker,
 * turns its frame stream into a coalesced subscribe stream split by update
 * rate, and adopts/watches the shared position buffers:
 * - structure events (topology / LOD cut) fire when a new StructureFrame commits;
 * - position events (layout positions, edge geometry, SAB notifies) are
 *   coalesced to at most one per animation frame.
 *
 * The presentation subscribes and drives Deck.gl imperatively from these events,
 * so no React state ever holds per-frame data and the layer set is never rebuilt
 * wholesale.
 *
 * The lifecycle-specific halves ({@link "./entity-worker-connection"},
 * {@link "./type-worker-connection"}) send their own init/ingest/query
 * messages and resolve node identity their own way (entity id-map SAB vs.
 * type id table); every reply the frame stream does not consume lands in
 * their {@link FrameConnection.handleLifecycleMessage}.
 */
import {
  FLAT_ENTITYIDX_BYTE_OFFSET,
  FLAT_HEADER_BYTES,
  FLAT_RECORD_BYTES,
} from "../worker/buffers/position-buffer";
import { configureEntityStyle } from "../worker/entity-style";

import type { VizConfig } from "../config";
import type { PositionsFrame, StructureFrame } from "../frames";
import type { ClusterId } from "../ids";
import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
} from "../worker/protocol";
import type {
  MainToTypeWorkerMessage,
  TypeEgoResultMessage,
  TypeIdTableMessage,
} from "../worker/type-graph/protocol";

const WORKER_DEBUG_LOGS_KEY = "hashGraphDebugWorkerLogs";

export function workerDebugLogsEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(WORKER_DEBUG_LOGS_KEY) === "1";
}

/** Everything either lifecycle may send to the shared worker entry. */
type OutboundMessage = MainToWorkerMessage | MainToTypeWorkerMessage;
/** Everything the shared worker entry may post back, across both lifecycles. */
type InboundMessage =
  | WorkerToMainMessage
  | TypeIdTableMessage
  | TypeEgoResultMessage;

/** Message types the base frame stream consumes; the rest are lifecycle traffic. */
type FrameStreamMessageType =
  | "READY"
  | "STRUCTURE_FRAME"
  | "POSITIONS_FRAME"
  | "ERROR"
  | "LAYOUT_CREATED"
  | "BUFFER_REPUBLISHED"
  | "LAYOUT_POSITIONS"
  | "LAYOUT_DESTROYED";

/** What a subclass's {@link FrameConnection.handleLifecycleMessage} receives. */
export type LifecycleMessage = Exclude<
  InboundMessage,
  { type: FrameStreamMessageType }
>;

/** A view into one layout's position SharedArrayBuffer. */
export interface ClusterReference {
  readonly clusterId: ClusterId;
  /** Int32 version counter at byte 0; written + Atomics.notify'd by the worker. */
  readonly versionView: Int32Array;
  /** `[x0, y0, x1, y1, ...]` in the layout's local frame. Replaced on non-SAB fallback. */
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

/** The lifecycle-neutral surface both connections expose to the presentation. */
export interface FrameHandle {
  /** Latest topology, or undefined before the first structure frame. */
  getStructure(): StructureFrame | undefined;
  /** Latest layout positions + edge geometry. */
  getPositions(): PositionsFrame | undefined;
  /** Layout position SABs, keyed by layout (cluster / flat) id. */
  getClusters(): Map<ClusterId, ClusterReference>;
  /** Subscribe to updates. Replays current state immediately; returns unsubscribe. */
  subscribe(listener: WorkerListener): () => void;
  sendViewport(viewport: ViewportRect): void;
  /**
   * Apply a new config live: the worker keeps its ingested state and
   * re-lays out under the new tuning (no worker recreation, camera
   * untouched). No-op when `config` is the reference already applied.
   */
  updateConfig(config: VizConfig): void;
  /**
   * Freeze or resume the worker's layout simulation. Paused, the worker
   * stops ticking (and therefore stops emitting positions frames) but keeps
   * all state; layouts resume from the same positions. Send `true` while the
   * visualizer is not visible (covered by a slide, hidden tab) so background
   * instances cost no CPU.
   */
  setSimulationPaused(paused: boolean): void;
}

/**
 * Correlates request/response message pairs by requestId. `settleAll` is for
 * dispose: every in-flight promise resolves with a fallback so awaiters never
 * hang after teardown.
 */
export class PendingRequests<Result> {
  #nextId = 0;
  readonly #pending = new Map<number, (result: Result) => void>();

  /** Register a resolver and get the requestId to send with the message. */
  open(resolve: (result: Result) => void): number {
    this.#nextId += 1;
    this.#pending.set(this.#nextId, resolve);
    return this.#nextId;
  }

  settle(requestId: number, result: Result): void {
    const resolve = this.#pending.get(requestId);
    if (resolve) {
      this.#pending.delete(requestId);
      resolve(result);
    }
  }

  settleAll(result: Result): void {
    for (const resolve of this.#pending.values()) {
      resolve(result);
    }
    this.#pending.clear();
  }
}

/** u32 slot index of a flat record's join key within the buffer's u32 view. */
const flatJoinKeySlot = (recordIndex: number): number =>
  (FLAT_HEADER_BYTES +
    recordIndex * FLAT_RECORD_BYTES +
    FLAT_ENTITYIDX_BYTE_OFFSET) /
  4;

/**
 * A flat-tier record's u32 join key (`entityIdx` in the entity lifecycle,
 * `TypeId` in the type lifecycle). Flat records reorder as nodes stream in,
 * so the key is read off the live record, never inferred from the index.
 */
export function flatRecordJoinKey(
  cluster: ClusterReference,
  recordIndex: number
): number | undefined {
  const records = new Uint32Array(cluster.versionView.buffer);
  return records[flatJoinKeySlot(recordIndex)];
}

export interface FrameConnectionConfig {
  readonly config: VizConfig;
  readonly onReady: () => void;
  readonly onError: (message: string) => void;
}

export abstract class FrameConnection implements FrameHandle {
  readonly #worker: Worker;
  readonly #onReady: () => void;
  readonly #onError: (message: string) => void;
  /** The config last sent to the worker, for the updateConfig no-op check. */
  #appliedConfig: VizConfig;

  #structure: StructureFrame | undefined;
  #positions: PositionsFrame | undefined;
  /** Held until its paired positions frame lands, so the two commit together. */
  #pendingStructure: StructureFrame | undefined;
  readonly #clusters = new Map<ClusterId, ClusterReference>();

  readonly #listeners = new Set<WorkerListener>();

  #frameId = 0;
  #structureDirty = false;
  #positionDirty = false;
  #replacedBuffers: ClusterId[] = [];
  #flushHandle: number | undefined;

  constructor({ config, onReady, onError }: FrameConnectionConfig) {
    this.#onReady = onReady;
    this.#onError = onError;
    this.#appliedConfig = config;

    // The worker installs the same style at init; this covers main-thread
    // consumers (hub-label radii).
    configureEntityStyle(config.entityStyle);

    this.#worker = new Worker(new URL("../worker/entry.ts", import.meta.url));
    this.#worker.onmessage = ({ data }: MessageEvent<InboundMessage>) =>
      this.#handleMessage(data);
    this.#worker.onerror = (event) => this.#onError(event.message);
  }

  /**
   * Every reply the frame stream does not consume: queries, id maps/tables,
   * and informational messages belong to the lifecycle subclass.
   */
  protected abstract handleLifecycleMessage(message: LifecycleMessage): void;

  /** A config as sent to the worker: the localStorage debug override folded in. */
  protected withDebugFlag(config: VizConfig): VizConfig {
    return { ...config, debug: config.debug || workerDebugLogsEnabled() };
  }

  protected send(message: OutboundMessage): void {
    this.#worker.postMessage(message);
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

  sendViewport({ zoom, center, width, height }: ViewportRect): void {
    this.#frameId += 1;
    this.send({
      type: "VIEWPORT_CHANGED",
      frameId: `vp-${this.#frameId}`,
      zoom,
      center,
      width,
      height,
    });
  }

  updateConfig(config: VizConfig): void {
    // Reference check: callers keep the applied config referentially stable
    // and produce a new object per change (React state), so identity is the
    // change signal. Avoids a gratuitous re-layout when an effect re-fires
    // with the same config (e.g. on the ready flip).
    if (config === this.#appliedConfig) {
      return;
    }
    this.#appliedConfig = config;

    // Keep the main thread's copy of the style module state in sync with
    // the worker's (hub-label radii read it here).
    configureEntityStyle(config.entityStyle);

    this.send({ type: "UPDATE_CONFIG", config: this.withDebugFlag(config) });
  }

  setSimulationPaused(paused: boolean): void {
    this.send({ type: "SET_SIMULATION_PAUSED", paused });
  }

  /**
   * Terminates the worker, cancels pending flushes, and clears listeners.
   * Subclasses override to also settle their in-flight requests.
   */
  dispose(): void {
    if (this.#flushHandle !== undefined) {
      cancelAnimationFrame(this.#flushHandle);
      this.#flushHandle = undefined;
    }
    this.#worker.terminate();
    this.#listeners.clear();
    this.#clusters.clear();
    this.#structure = undefined;
    this.#positions = undefined;
  }

  #handleMessage(data: InboundMessage): void {
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
      default:
        this.handleLifecycleMessage(data);
        break;
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
    buffer: SharedArrayBuffer | ArrayBuffer
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
}
