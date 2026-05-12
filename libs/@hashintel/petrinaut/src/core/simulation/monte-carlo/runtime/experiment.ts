import type { ReadableStore } from "../../../handle";
import type { EventStream } from "../../../instance";
import type {
  InitialMarking,
  SimulationTransport,
  WorkerFactory,
} from "../../api";
import { createWorkerTransport } from "../../runtime/transport";
import type { SDCPN } from "../../../types/sdcpn";
import type { PlaceTokenCountDistributionFrame } from "../metrics";
import type {
  MonteCarloToMainMessage,
  MonteCarloWorkerProgress,
} from "../worker/messages";

export type MonteCarloExperimentState =
  | "Initializing"
  | "Ready"
  | "Running"
  | "Complete"
  | "Error"
  | "Cancelled";

export type MonteCarloExperimentDistributions = {
  frames: readonly PlaceTokenCountDistributionFrame[];
  latest: PlaceTokenCountDistributionFrame | null;
};

export type MonteCarloExperimentEvent =
  | { type: "complete"; progress: MonteCarloWorkerProgress }
  | { type: "cancelled"; progress: MonteCarloWorkerProgress | null }
  | { type: "error"; message: string; itemId: string | null };

export type CreateMonteCarloExperimentConfig = {
  sdcpn: SDCPN;
  initialMarking: InitialMarking;
  parameterValues: Record<string, string>;
  seed: number;
  dt: number;
  maxTime: number;
  runCount: number;
  batchSize?: number;
  signal?: AbortSignal;
} & (
  | { createWorker: WorkerFactory; transport?: never }
  | { transport: SimulationTransport; createWorker?: never }
);

export interface MonteCarloExperiment {
  readonly status: ReadableStore<MonteCarloExperimentState>;
  readonly progress: ReadableStore<MonteCarloWorkerProgress | null>;
  readonly distributions: ReadableStore<MonteCarloExperimentDistributions>;
  readonly events: EventStream<MonteCarloExperimentEvent>;

  start(this: void): void;
  cancel(this: void): void;
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

export function createMonteCarloExperiment(
  config: CreateMonteCarloExperimentConfig,
): Promise<MonteCarloExperiment> {
  const transport =
    "transport" in config && config.transport !== undefined
      ? config.transport
      : createWorkerTransport(config.createWorker);
  const status = createReadableStore<MonteCarloExperimentState>("Initializing");
  const progress = createReadableStore<MonteCarloWorkerProgress | null>(null);
  const distributions = createReadableStore<MonteCarloExperimentDistributions>({
    frames: [],
    latest: null,
  });
  const events = createEventStream<MonteCarloExperimentEvent>();
  let disposed = false;

  return new Promise<MonteCarloExperiment>((resolve, reject) => {
    let settled = false;
    let handle: MonteCarloExperiment;

    const off = transport.onMessage((rawMessage) => {
      const message = rawMessage as MonteCarloToMainMessage;

      switch (message.type) {
        case "ready": {
          status.set("Ready");
          if (!settled) {
            settled = true;
            resolve(handle);
          }
          break;
        }
        case "distributionFrames": {
          const frames = [...distributions.get().frames, ...message.frames];
          distributions.set({
            frames,
            latest: frames.at(-1) ?? null,
          });
          break;
        }
        case "progress":
          progress.set(message.progress);
          break;
        case "complete":
          progress.set(message.progress);
          status.set("Complete");
          events.emit({ type: "complete", progress: message.progress });
          break;
        case "cancelled":
          progress.set(message.progress);
          status.set("Cancelled");
          events.emit({ type: "cancelled", progress: message.progress });
          break;
        case "error":
          status.set("Error");
          events.emit({
            type: "error",
            message: message.message,
            itemId: message.itemId,
          });
          if (!settled) {
            settled = true;
            reject(new Error(message.message));
          }
          break;
      }
    });

    const onAbort = () => {
      if (!settled) {
        settled = true;
        reject(
          new DOMException(
            "Monte Carlo experiment start aborted",
            "AbortError",
          ),
        );
      }
      handle.dispose();
    };

    handle = {
      status,
      progress,
      distributions,
      events,
      start() {
        if (disposed) {
          return;
        }
        status.set("Running");
        transport.send({ type: "start" });
      },
      cancel() {
        if (disposed) {
          return;
        }
        transport.send({ type: "cancel" });
      },
      dispose() {
        if (disposed) {
          return;
        }
        disposed = true;
        config.signal?.removeEventListener("abort", onAbort);
        off();
        try {
          transport.send({ type: "cancel" });
        } catch {
          // Transport may already be torn down.
        }
        transport.terminate();
      },
    };

    if (config.signal) {
      if (config.signal.aborted) {
        onAbort();
        return;
      }
      config.signal.addEventListener("abort", onAbort, { once: true });
    }

    transport.send({
      type: "init",
      sdcpn: config.sdcpn,
      initialMarking: config.initialMarking,
      parameterValues: config.parameterValues,
      seed: config.seed,
      dt: config.dt,
      maxTime: config.maxTime,
      runCount: config.runCount,
      batchSize: config.batchSize,
    });
  });
}
