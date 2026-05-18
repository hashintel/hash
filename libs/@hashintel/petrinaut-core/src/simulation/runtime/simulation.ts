import type { ReadableStore } from "../../handle";
import type { EventStream } from "../../instance";
import type {
  CreateSimulationConfig,
  Simulation,
  SimulationErrorEvent,
  SimulationEvent,
  SimulationFrameSummary,
  SimulationState,
  SimulationTransport,
} from "../api";
import { createWorkerTransport } from "./transport";
import type { ToMainMessage } from "../worker/messages";
import type { SimulationFramePayload } from "../worker/frame-payload";
import { createInMemorySimulationFrameStore } from "./frame-store";

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
  let disposed = false;

  return new Promise<Simulation>((resolve, reject) => {
    const frameStore = createInMemorySimulationFrameStore(config.sdcpn);
    let settled = false;
    let handle: Simulation;

    function pushFrames(newFrames: SimulationFramePayload[]): void {
      if (newFrames.length === 0) {
        return;
      }
      frameStore.appendBatch(newFrames);
      frameSummary.set({
        count: frameStore.count(),
        latest: frameStore.latest(),
      });
    }

    const off = transport.onMessage((rawMessage) => {
      const message = rawMessage as ToMainMessage;
      switch (message.type) {
        case "ready": {
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
          return;
        }
        status.set("Running");
        transport.send({ type: "start" });
      },
      pause() {
        if (disposed) {
          return;
        }
        transport.send({ type: "pause" });
        // Confirmation comes via the "paused" message.
      },
      reset() {
        if (disposed) {
          return;
        }
        transport.send({ type: "stop" });
        frameStore.clear();
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
        return frameStore.get(index);
      },
      dispose() {
        if (disposed) {
          return;
        }
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

    transport.send({
      type: "init",
      sdcpn: config.sdcpn,
      initialMarking: config.initialMarking,
      parameterValues: config.parameterValues,
      seed: config.seed,
      dt: config.dt,
      maxTime: config.maxTime,
      maxFramesAhead: config.backpressure?.maxFramesAhead,
      batchSize: config.backpressure?.batchSize,
    });
  });
}
