import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  sanitizeSDCPNForExtensions,
} from "../../extensions";
import {
  runClockOf,
  runContinuityOf,
  type RunClock,
  type RunContinuity,
} from "../../net-timing";
import {
  deriveDefaultParameterValues,
  mergeParameterValues,
} from "../../parameter-values";
import { createReadableStore } from "../../store";
import { flattenComponentInstancesForSimulation } from "../engine/flatten-component-instances";
import { createEventStream } from "../monte-carlo/runtime/experiment-stores";
import { createWorkerTransport } from "../runtime/transport";
import { createInMemoryEventTraceStore } from "./trace-store";

import type { AbortSignalLike } from "../../environment";
import type { PetrinautExtensionSettings } from "../../extensions";
import type { HirArtifacts } from "../../hir-runtime";
import type { EventStream } from "../../instance";
import type { ReadableStore } from "../../store";
import type { SDCPN } from "../../types/sdcpn";
import type {
  InitialMarking,
  SimulationFrameReader,
  SimulationState,
  SimulationTransport,
  WorkerFactory,
} from "../api";
import type {
  EventSimulationErrorEvent,
  EventSimulationEvent,
  EventTraceSummary,
  TraceEvent,
} from "./trace";
import type { ToEventMainMessage } from "./worker/messages";
import type { StepperSelection } from "./worker/steppers";

/**
 * Per-run configuration of an event-driven run. The run is configured by
 * what computes it: a simulator and that simulator's parameter values. How
 * time advances and which states are recorded are the simulator's business.
 */
export type EventSimulationConfig = {
  sdcpn: SDCPN;
  extensions?: PetrinautExtensionSettings;
  initialMarking: InitialMarking;
  parameterValues: Record<string, string>;
  seed: number;
  /** Simulation time the run stops at. Null runs until deadlock or stop. */
  maxTime: number | null;
  hirArtifacts?: HirArtifacts;
  /** The simulator whose stepper advances the run, with its parameter values. */
  simulator: StepperSelection;
  /** Optional cancellation. Aborting tears down the simulation. */
  signal?: AbortSignalLike;
};

export type CreateEventSimulationConfig = EventSimulationConfig &
  (
    | { createWorker: WorkerFactory; transport?: never }
    | { transport: SimulationTransport; createWorker?: never }
  );

export interface EventSimulation {
  /**
   * What the run's positions count: simulated seconds, or the steps of an
   * untimed net. Every `time` of the run is in that unit.
   */
  readonly clock: RunClock;
  /**
   * What lies between two events of the run: the continuous evolution of a
   * net with dynamics, or nothing. A viewer of a discrete run has only its
   * events to view.
   */
  readonly continuity: RunContinuity;
  readonly status: ReadableStore<SimulationState>;
  readonly trace: ReadableStore<EventTraceSummary>;
  readonly events: EventStream<EventSimulationEvent>;
  /** Frame place index by place id: the order of an event's per-place arrays. */
  readonly placeIndexById: ReadonlyMap<string, number>;

  run(this: void): void;
  pause(this: void): void;
  /** Lets the worker compute until the trace covers `time`. */
  demand(this: void, time: number): void;

  getEvent(this: void, index: number): TraceEvent | null;
  /** Index of the last event at or before `time`, or -1 before the first. */
  findEventIndexAt(this: void, time: number): number;
  /**
   * Index of the last discrete event (the initial state or a firing) at or
   * before `index`, or null. Reference frames are skipped.
   */
  findDiscreteEventAtOrBefore(this: void, index: number): number | null;
  /** Index of the first discrete event after `index`, or null. */
  findDiscreteEventAfter(this: void, index: number): number | null;
  /** The state an event recorded. */
  getEventState(this: void, index: number): SimulationFrameReader | null;
  /** The state at any `time` the trace covers, interpolated between events. */
  getStateAt(this: void, time: number): SimulationFrameReader | null;

  dispose(this: void): void;
}

const EMPTY_SUMMARY: EventTraceSummary = {
  eventCount: 0,
  coveredTime: 0,
  latest: null,
};

/**
 * Builds an event-driven run. Resolves with the live {@link EventSimulation}
 * once the worker reports `ready`; rejects (and disposes) on an
 * initialization error or when `signal` aborts first.
 *
 * The host side mirrors `createSimulation`: a transport to the worker, a
 * store that keeps what the worker sends, and stores that publish status and
 * progress. What differs is the unit: the worker sends events rather than
 * frames, and the host asks for time rather than acknowledging frames.
 */
export function createEventSimulation(
  config: CreateEventSimulationConfig,
): Promise<EventSimulation> {
  const transport: SimulationTransport =
    "transport" in config && config.transport !== undefined
      ? config.transport
      : createWorkerTransport(config.createWorker);

  const status = createReadableStore<SimulationState>("Initializing");
  const trace = createReadableStore<EventTraceSummary>(EMPTY_SUMMARY);
  const events = createEventStream<EventSimulationEvent>();
  const extensions = config.extensions ?? DEFAULT_PETRINAUT_EXTENSIONS;
  const sanitizedSdcpn = sanitizeSDCPNForExtensions(config.sdcpn, extensions);

  // The store's frame layout has to match the worker's, which flattens
  // component instances before building the run.
  const rootParameterValues = extensions.parameters
    ? mergeParameterValues(
        config.parameterValues,
        deriveDefaultParameterValues(sanitizedSdcpn.parameters),
        sanitizedSdcpn.parameters,
      )
    : {};
  const { sdcpn: flattenedSdcpn } = flattenComponentInstancesForSimulation({
    sdcpn: sanitizedSdcpn,
    initialMarking: config.initialMarking,
    rootParameterValues,
    parametersEnabled: extensions.parameters,
  });

  let disposed = false;

  return new Promise<EventSimulation>((resolve, reject) => {
    const store = createInMemoryEventTraceStore(flattenedSdcpn);
    let settled = false;
    let handle: EventSimulation;

    const off = transport.onMessage((rawMessage) => {
      const message = rawMessage as ToEventMainMessage;
      switch (message.type) {
        case "ready": {
          status.set("Ready");
          if (!settled) {
            settled = true;
            resolve(handle);
          }
          break;
        }
        case "events": {
          store.append(message.events);
          trace.set({
            eventCount: store.count(),
            coveredTime: message.coveredTime,
            latest: store.latest(),
          });
          break;
        }
        case "paused":
          status.set("Paused");
          break;
        case "complete":
          status.set("Complete");
          events.emit({
            type: "complete",
            reason: message.reason,
            time: message.time,
          });
          break;
        case "error": {
          status.set("Error");
          const errorEvent: EventSimulationErrorEvent = {
            type: "error",
            message: message.message,
            itemId: message.itemId,
          };
          events.emit(errorEvent);
          if (!settled) {
            // The start failed: nothing will hold the handle, so the worker
            // is released here.
            settled = true;
            handle.dispose();
            reject(new Error(message.message));
          }
          break;
        }
      }
    });

    const onAbort = () => {
      if (!settled) {
        settled = true;
        const error = new Error("Event simulation start aborted");
        error.name = "AbortError";
        reject(error);
      }
      handle.dispose();
    };

    const send = (message: Parameters<SimulationTransport["send"]>[0]) => {
      if (!disposed) {
        transport.send(message);
      }
    };

    handle = {
      clock: runClockOf(config.sdcpn, extensions),
      continuity: runContinuityOf(config.sdcpn, extensions),
      status,
      trace,
      events,
      placeIndexById: store.placeIndexById,

      run() {
        if (disposed) {
          return;
        }
        status.set("Running");
        send({ type: "start" });
      },
      pause: () => send({ type: "pause" }),
      demand: (time) => send({ type: "demand", time }),
      getEvent: (index) => store.getEvent(index),
      findEventIndexAt: (time) => store.findIndexAt(time),
      findDiscreteEventAtOrBefore: (index) =>
        store.findDiscreteEventAtOrBefore(index),
      findDiscreteEventAfter: (index) => store.findDiscreteEventAfter(index),
      getEventState: (index) => store.getEventState(index),
      getStateAt: (time) => store.getStateAt(time),
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

    // Checked once the handle exists, so an abort that came first has
    // something to dispose.
    if (config.signal?.aborted) {
      onAbort();
      return;
    }
    config.signal?.addEventListener("abort", onAbort, { once: true });

    transport.send({
      type: "init",
      sdcpn: sanitizedSdcpn,
      extensions,
      initialMarking: config.initialMarking,
      parameterValues: config.parameterValues,
      seed: config.seed,
      maxTime: config.maxTime,
      hirArtifacts: config.hirArtifacts,
      simulator: config.simulator,
    });
  });
}
