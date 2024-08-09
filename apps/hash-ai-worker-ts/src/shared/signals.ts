/**
 * @fileoverview This file contents signals which are local to the Temporal worker.
 * Signals that need to be sent from outside are in @local/hash-isomorphic-utils/src/flows/signals.ts
 */

import type {
  ExternalInputRequestSignal,
  FlowSignalType,
  ProgressLogBase,
  ProgressLogSignal,
} from "@local/hash-isomorphic-utils/flows/types";
import { defineSignal } from "@temporalio/workflow";
import { CoordinatingAgentState } from "../activities/flow-activities/research-entities-action/coordinating-agent.js";

/** Record progress logs from an activity to allow for inspection of work before the activity completes */
export const logProgressSignal = defineSignal<[ProgressLogSignal]>(
  "logProgress" satisfies FlowSignalType,
);

export const externalInputRequestSignal = defineSignal<
  [ExternalInputRequestSignal]
>("externalInputRequest" satisfies FlowSignalType);

export type ResearchActionCheckpointState = {
  state?: CoordinatingAgentState;
};

export type ResearchActionCheckpointSignal = ProgressLogBase & {
  data: ResearchActionCheckpointState;
  checkpointId: string;
};

export const researchActionCheckpointSignal = defineSignal<
  [ResearchActionCheckpointSignal]
>("researchActionCheckpoint" satisfies FlowSignalType);
