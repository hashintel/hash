/**
 * @fileoverview This file contents signal-related code which are local to the Temporal worker.
 *
 * Code that needs to be accessible from outside the worker is in @local/hash-isomorphic-utils/src/flows/signals.ts
 */

import type {
  ExternalInputRequestSignal,
  FlowSignalType,
  ProgressLogBase,
  ProgressLogSignal,
} from "@local/hash-isomorphic-utils/flows/types";
import { defineSignal } from "@temporalio/workflow";

import type { CoordinatingAgentState } from "../activities/flow-activities/research-entities-action/shared/coordinators.js";

/** Record progress logs from an activity to allow for inspection of work before the activity completes */
export const logProgressSignal = defineSignal<[ProgressLogSignal]>(
  "logProgress" satisfies FlowSignalType,
);

/**
 * Send a request for external input
 */
export const externalInputRequestSignal = defineSignal<
  [ExternalInputRequestSignal]
>("externalInputRequest" satisfies FlowSignalType);

/**
 * State from which to restore the 'research entities' action, which can be reset to at the user's request.
 */
export type ResearchActionCheckpointState = {
  state?: CoordinatingAgentState;
};

/**
 * Signal sent as a means of recording a checkpoint's state, and an id to identify it by.
 *
 * @todo H-3129: this is only required because so much work is being done in a single long-running activity
 *   – the better and more idiomatic Temporal solution is to split it up into multiple activities,
 *     probably with the 'researchEntitiesAction' becoming a child workflow that calls activities (or its own child workflows).
 *     then Temporal holds the state in the event history, and resetting the workflow to a specific event is sufficient.
 */
export type ResearchActionCheckpointSignal = ProgressLogBase & {
  data: ResearchActionCheckpointState;
  checkpointId: string;
};

export const researchActionCheckpointSignal = defineSignal<
  [ResearchActionCheckpointSignal]
>("researchActionCheckpoint" satisfies FlowSignalType);

/**
 * Stop a HASH AI worker (not the Temporal worker)
 */
export type StopWorkerSignal = {
  /**
   * The calling agent's explanation of why the worker should be stopped.
   * The agent that decides to stop the worker is the one that started it.
   */
  explanation: string;
  /**
   * The LLM provider's identifier for the tool call that started the worker.
   */
  toolCallId: string;
};

export const stopWorkerSignal = defineSignal<[StopWorkerSignal]>(
  "stopWorker" satisfies FlowSignalType,
);

export type FlowSignal =
  | ExternalInputRequestSignal
  | ResearchActionCheckpointSignal
  | StopWorkerSignal
  | ProgressLogSignal;
