/**
 * Messages between the host and the event simulation worker.
 *
 * The shape follows the frame worker's protocol, with time in place of frame
 * counts: the host demands a time rather than acknowledging frames, and the
 * worker reports the time its trace covers rather than a frame number.
 */

import type { PetrinautExtensionSettings } from "../../../extensions";
import type { HirArtifacts } from "../../../hir-runtime";
import type { SDCPN } from "../../../types/sdcpn";
import type { InitialMarking } from "../../api";
import type { SimulationCompletionReason } from "../../engine/compute-next-frame";
import type { TraceEvent } from "../trace";
import type { StepperSelection } from "./steppers";

//
// Host → Worker
//

export type EventSimulationInitMessage = {
  type: "init";
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
};

export type EventSimulationStartMessage = { type: "start" };
export type EventSimulationPauseMessage = { type: "pause" };
export type EventSimulationStopMessage = { type: "stop" };

/**
 * Lets the worker compute until its trace covers `time`. The worker computes
 * nothing until the first demand, and waits once it has reached the latest
 * one, which bounds how far it runs ahead of its consumer.
 */
export type EventSimulationDemandMessage = { type: "demand"; time: number };

export type ToEventWorkerMessage =
  | EventSimulationInitMessage
  | EventSimulationStartMessage
  | EventSimulationPauseMessage
  | EventSimulationStopMessage
  | EventSimulationDemandMessage;

//
// Worker → Host
//

export type EventSimulationReadyMessage = { type: "ready" };

/**
 * A batch of events in order, and the time the trace is complete up to once
 * they are applied. `events` is empty when the worker advanced through a
 * stretch where nothing fired.
 */
export type EventSimulationEventsMessage = {
  type: "events";
  events: TraceEvent[];
  coveredTime: number;
};

export type EventSimulationPausedMessage = { type: "paused"; time: number };

export type EventSimulationCompleteMessage = {
  type: "complete";
  reason: SimulationCompletionReason;
  time: number;
};

export type EventSimulationErrorMessage = {
  type: "error";
  message: string;
  itemId: string | null;
};

export type ToEventMainMessage =
  | EventSimulationReadyMessage
  | EventSimulationEventsMessage
  | EventSimulationPausedMessage
  | EventSimulationCompleteMessage
  | EventSimulationErrorMessage;
