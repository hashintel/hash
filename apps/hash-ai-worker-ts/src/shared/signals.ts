/**
 * @fileoverview This file contents signals which are local to the Temporal worker.
 * Signals that need to be sent from outside are in @local/hash-isomorphic-utils/src/flows/signals.ts
 */

import type {
  ExternalInputRequestSignal,
  FlowSignalType,
  ProgressLogSignal,
} from "@local/hash-isomorphic-utils/flows/types";
import { defineSignal } from "@temporalio/workflow";

/** Record progress logs from an activity to allow for inspection of work before the activity completes */
export const logProgressSignal = defineSignal<[ProgressLogSignal]>(
  "logProgress" satisfies FlowSignalType,
);

export const externalInputRequestSignal = defineSignal<
  [ExternalInputRequestSignal]
>("externalInputRequest" satisfies FlowSignalType);
