import type { ReadableStore } from "../handle";
import type { EventStream } from "../instance";
import type { SDCPN } from "../types/sdcpn";
import {
  createWorkerTransport,
  type SimulationTransport,
  type WorkerFactory,
} from "./transport";
import type { InitialMarking, SimulationFrame } from "./types";

export type SimulationState =
  | "Initializing"
  | "Ready"
  | "Running"
  | "Paused"
  | "Complete"
  | "Error";

export type BackpressureConfig = {
  /** Maximum frames the worker can compute ahead before waiting for ack. */
  maxFramesAhead?: number;
  /** Number of frames to compute in each batch before checking for messages. */
  batchSize?: number;
};

/**
 * Common per-run config shared by both transport modes. The simulation runs
 * against the {@link sdcpn} snapshot and never reads it again, so subsequent
 * mutations to the source document don't affect a running simulation.
 */
export type SimulationConfig = {
  sdcpn: SDCPN;
  initialMarking: InitialMarking;
  parameterValues: Record<string, string>;
  seed: number;
  dt: number;
  /** Maximum simulation time. Null = no limit. */
  maxTime: number | null;
  backpressure?: BackpressureConfig;
  /** Optional cancellation. Aborting tears down the simulation. */
  signal?: AbortSignal;
};

/**
 * Top-level config for {@link createSimulation}. Provide exactly one of:
 *
 * - `createWorker`: a `Worker` factory; the function builds a transport for you.
 * - `transport`: a pre-built {@link SimulationTransport}; ownership transfers
 *   to the simulation (it will be terminated on `simulation.dispose()`).
 */
export type CreateSimulationConfig = SimulationConfig &
  (
    | { createWorker: WorkerFactory; transport?: never }
    | { transport: SimulationTransport; createWorker?: never }
  );

export type SimulationCompleteEvent = {
  type: "complete";
  reason: "deadlock" | "maxTime";
  frameNumber: number;
};

export type SimulationErrorEvent = {
  type: "error";
  message: string;
  itemId: string | null;
};

export type SimulationEvent = SimulationCompleteEvent | SimulationErrorEvent;

export type SimulationFrameSummary = {
  count: number;
  latest: SimulationFrame | null;
};

export interface Simulation {
  readonly status: ReadableStore<SimulationState>;
  readonly frames: ReadableStore<SimulationFrameSummary>;
  readonly events: EventStream<SimulationEvent>;

  run(this: void): void;
  pause(this: void): void;
  reset(this: void): void;
  ack(this: void, frameNumber: number): void;
  setBackpressure(this: void, cfg: BackpressureConfig): void;
  getFrame(this: void, index: number): SimulationFrame | null;

  dispose(this: void): void;
}

function createReadableStore<T>(initial: T): ReadableStore<T> & {
  set(next: T): void;
} {
  let current = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      if (Object.is(next, current)) {
        return;
      }
      current = next;
      for (const listener of listeners) {
        listener(current);
      }
    },
  };
}

function createEventStream<T>(): EventStream<T> & { emit(event: T): void } {
  const listeners = new Set<(event: T) => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(event) {
      for (const listener of listeners) {
        listener(event);
      }
    },
  };
}

/**
 * Build and start a simulation. Resolves with the live {@link Simulation}
 * handle once the worker reports `ready`. Rejects (and disposes) if the worker
 * errors during initialization, or if `signal` aborts before init completes.
 *
 * Either pass a `createWorker` factory (the function builds a transport) or a
 * pre-built `transport` (ownership transfers to the simulation; it'll be
 * terminated on `dispose()`).
 *
 * The simulation runs against the `sdcpn` snapshot and is independent of any
 * `Petrinaut` instance — pass `instance.handle.doc()` (or any other SDCPN
 * value) and you're done.
 */
export function createSimulation(
  config: CreateSimulationConfig,
): Promise<Simulation> {
  const transport: SimulationTransport =
    "transport" in config && config.transport !== undefined
      ? config.transport
      : createWorkerTransport(config.createWorker);

  const status = createReadableStore<SimulationState>("Initializing");
  const frameSummary = createReadableStore<SimulationFrameSummary>({
    count: 0,
    latest: null,
  });
  const events = createEventStream<SimulationEvent>();
  const frames: SimulationFrame[] = [];
  let disposed = false;

  function pushFrames(newFrames: SimulationFrame[]): void {
    if (newFrames.length === 0) {
      return;
    }
    for (const frame of newFrames) {
      frames.push(frame);
    }
    frameSummary.set({
      count: frames.length,
      latest: frames[frames.length - 1] ?? null,
    });
  }

  // eslint-disable-next-line no-console
  console.log("[sim] createSimulation: starting", {
    sdcpnPlaces: config.sdcpn.places.length,
    sdcpnTransitions: config.sdcpn.transitions.length,
    seed: config.seed,
    dt: config.dt,
  });

  return new Promise<Simulation>((resolve, reject) => {
    let settled = false;
    let handle: Simulation;

    const off = transport.onMessage((message) => {
      switch (message.type) {
        case "ready": {
          // eslint-disable-next-line no-console
          console.log("[sim] handle saw ready → status=Ready, resolving");
          status.set("Ready");
          if (!settled) {
            settled = true;
            resolve(handle);
          }
          break;
        }
        case "frame":
          pushFrames([message.frame]);
          break;
        case "frames":
          pushFrames(message.frames);
          break;
        case "paused":
          status.set("Paused");
          break;
        case "complete":
          status.set("Complete");
          events.emit({
            type: "complete",
            reason: message.reason,
            frameNumber: message.frameNumber,
          });
          break;
        case "error": {
          status.set("Error");
          const errorEvent: SimulationErrorEvent = {
            type: "error",
            message: message.message,
            itemId: message.itemId,
          };
          events.emit(errorEvent);
          if (!settled) {
            settled = true;
            reject(new Error(message.message));
          }
          break;
        }
      }
    });

    const onAbort = () => {
      if (!settled) {
        settled = true;
        reject(new DOMException("Simulation start aborted", "AbortError"));
      }
      handle.dispose();
    };

    if (config.signal) {
      if (config.signal.aborted) {
        onAbort();
        return;
      }
      config.signal.addEventListener("abort", onAbort, { once: true });
    }

    handle = {
      status,
      frames: frameSummary,
      events,

      run() {
        if (disposed) {
          // eslint-disable-next-line no-console
          console.warn("[sim] handle.run() ignored — disposed");
          return;
        }
        // eslint-disable-next-line no-console
        console.log(
          "[sim] handle.run() → optimistic status=Running + sending start",
        );
        status.set("Running");
        transport.send({ type: "start" });
      },
      pause() {
        if (disposed) {
          // eslint-disable-next-line no-console
          console.warn("[sim] handle.pause() ignored — disposed");
          return;
        }
        // eslint-disable-next-line no-console
        console.log("[sim] handle.pause() → sending pause");
        transport.send({ type: "pause" });
        // Confirmation comes via the "paused" message.
      },
      reset() {
        if (disposed) {
          return;
        }
        transport.send({ type: "stop" });
        frames.length = 0;
        frameSummary.set({ count: 0, latest: null });
        status.set("Ready");
      },
      ack(frameNumber) {
        if (disposed) {
          return;
        }
        transport.send({ type: "ack", frameNumber });
      },
      setBackpressure(cfg) {
        if (disposed) {
          return;
        }
        transport.send({
          type: "setBackpressure",
          maxFramesAhead: cfg.maxFramesAhead,
          batchSize: cfg.batchSize,
        });
      },
      getFrame(index) {
        return frames[index] ?? null;
      },
      dispose() {
        if (disposed) {
          return;
        }
        // eslint-disable-next-line no-console
        console.log("[sim] handle.dispose() called");
        disposed = true;
        config.signal?.removeEventListener("abort", onAbort);
        off();
        try {
          transport.send({ type: "stop" });
        } catch {
          // Transport may already be torn down.
        }
        transport.terminate();
      },
    };

    // eslint-disable-next-line no-console
    console.log("[sim] sending init message");
    transport.send({
      type: "init",
      sdcpn: config.sdcpn,
      initialMarking: Array.from(config.initialMarking.entries()),
      parameterValues: config.parameterValues,
      seed: config.seed,
      dt: config.dt,
      maxTime: config.maxTime,
      maxFramesAhead: config.backpressure?.maxFramesAhead,
      batchSize: config.backpressure?.batchSize,
    });
  });
}
