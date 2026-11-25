import { flattenComponentInstancesForSimulation } from "../../composition/flatten-component-instances";
import {
  deriveDefaultParameterValues,
  mergeParameterValues,
} from "../../document/parameter-values";
import { createExecutionTrace } from "../../execution-trace/execution-trace";
import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  sanitizeSDCPNForExtensions,
} from "../../extensions/extensions";
import { runClockOf, runContinuityOf } from "../../extensions/net-class";
import { createReadableStore } from "../../store";
import { createEventStream } from "../monte-carlo/runtime/experiment-stores";
import { createWorkerTransport } from "../worker-transport";

import type { AbortSignalLike } from "../../environment/environment";
import type { ExecutionTrace } from "../../execution-trace/execution-trace";
import type { PetrinautExtensionSettings } from "../../extensions/extensions";
import type { HirArtifacts } from "../../hir-runtime";
import type { EventStream, ReadableStore } from "../../store";
import type { SDCPN } from "../../types/sdcpn";
import type {
  InitialMarking,
  SimulationState,
  SimulationTransport,
  WorkerFactory,
} from "../api";
import type { StepperSelection } from "../steppers/steppers";
import type { EventSimulationErrorEvent, EventSimulationEvent } from "./trace";
import type { ToEventMainMessage } from "./worker/messages";

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

/**
 * A run a simulator computes: the trace its worker writes, and the controls
 * of the computation. Everything that shows the run reads `trace`.
 */
export interface EventSimulation {
  /**
   * The run as its events, and the state at any time it covers. The worker
   * computes until the trace covers the time last asked of it through
   * `trace.demand`.
   */
  readonly trace: ExecutionTrace;
  readonly status: ReadableStore<SimulationState>;
  readonly events: EventStream<EventSimulationEvent>;

  run(this: void): void;
  pause(this: void): void;

  dispose(this: void): void;
}

/**
 * Builds an event-driven run. Resolves with the live {@link EventSimulation}
 * once the worker reports `ready`; rejects (and disposes) on an
 * initialization error or when `signal` aborts first.
 *
 * The host side is a transport to the worker, the trace that keeps the events
 * the worker sends, and a store that publishes the status. The host bounds
 * the worker by time: the worker computes until its trace covers the time
 * last asked of it.
 */
export function createEventSimulation(
  config: CreateEventSimulationConfig,
): Promise<EventSimulation> {
  const transport: SimulationTransport =
    "transport" in config && config.transport !== undefined
      ? config.transport
      : createWorkerTransport(config.createWorker);

  const status = createReadableStore<SimulationState>("Initializing");
  const events = createEventStream<EventSimulationEvent>();
  const extensions = config.extensions ?? DEFAULT_PETRINAUT_EXTENSIONS;
  const sanitizedSdcpn = sanitizeSDCPNForExtensions(config.sdcpn, extensions);

  // The worker flattens component instances before building the run.
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
  const send = (message: Parameters<SimulationTransport["send"]>[0]) => {
    if (!disposed) {
      transport.send(message);
    }
  };

  // The trace's frame layout has to match the worker's, which is the
  // flattened net's. The clock and the continuity are the authored net's.
  const { trace, writer } = createExecutionTrace({
    net: flattenedSdcpn,
    clock: runClockOf(config.sdcpn, extensions),
    continuity: runContinuityOf(config.sdcpn, extensions),
    onDemand: (time) => send({ type: "demand", time }),
  });

  return new Promise<EventSimulation>((resolve, reject) => {
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
        case "events":
          writer.append(message.events, message.coveredTime);
          break;
        case "paused":
          status.set("Paused");
          break;
        case "complete":
          writer.end();
          status.set("Complete");
          events.emit({
            type: "complete",
            reason: message.reason,
            time: message.time,
          });
          break;
        case "error": {
          writer.end();
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

    handle = {
      trace,
      status,
      events,

      run() {
        if (disposed) {
          return;
        }
        status.set("Running");
        send({ type: "start" });
      },
      pause: () => send({ type: "pause" }),
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
