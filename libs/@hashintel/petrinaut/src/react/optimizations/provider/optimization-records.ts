import {
  PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE,
  type PetrinautOptimizationEvent,
  type PetrinautOptimizationInput,
} from "@hashintel/petrinaut-core";

import { foldBestTrial } from "../context";

import type { OptimizationOrigin, OptimizationRecord } from "../context";

export const createOptimizationRecord = (
  id: string,
  input: PetrinautOptimizationInput,
  origin: OptimizationOrigin,
): OptimizationRecord => ({
  id,
  input,
  createdAt: Date.now(),
  origin,
  status: "initializing",
  error: null,
  runId: null,
  lastSeq: 0,
  requestedTrials: input.study.trials,
  completedTrials: 0,
  prunedTrials: 0,
  failedTrials: 0,
  trials: [],
  best: null,
  importance: null,
});

/**
 * A cancellation reaches the editor as an error event: the stream has no type
 * of its own for it. It is an outcome, not a failure.
 */
export const isCancellationEvent = (
  event: Extract<PetrinautOptimizationEvent, { type: "error" }>,
): boolean => event.code === PETRINAUT_OPTIMIZATION_CANCELLED_ERROR_CODE;

/** The record after one optimizer event, `lastSeq` being the event's place in the stream. */
export const foldOptimizationEvent = (
  record: OptimizationRecord,
  event: PetrinautOptimizationEvent,
  lastSeq: number,
): OptimizationRecord => {
  switch (event.type) {
    case "started":
      return {
        ...record,
        lastSeq,
        status: "running",
        requestedTrials: event.requestedTrials,
      };
    case "trial":
      return {
        ...record,
        lastSeq,
        // A trial that settled as the study was stopped still reports;
        // it does not revive the study.
        status: record.status === "cancelled" ? "cancelled" : "running",
        completedTrials:
          record.completedTrials + (event.state === "complete" ? 1 : 0),
        prunedTrials: record.prunedTrials + (event.state === "pruned" ? 1 : 0),
        failedTrials: record.failedTrials + (event.state === "failed" ? 1 : 0),
        trials: [...record.trials, event],
        best: foldBestTrial(
          record.input.objective.direction,
          record.best,
          event,
        ),
        importance: event.importances ?? record.importance,
      };
    case "complete":
      return {
        ...record,
        lastSeq,
        status: "complete",
        // The complete event's requested-trial count is the true total,
        // but its completed/pruned/failed counts only cover the frames
        // this attachment observed, so the record's own accumulated
        // counters and running best stay authoritative.
        requestedTrials: event.requestedTrials,
        best: event.best ?? record.best,
        importance: event.importances ?? record.importance,
      };
    case "error":
      return {
        ...record,
        lastSeq,
        ...(isCancellationEvent(event)
          ? { status: "cancelled", error: null }
          : { status: "error", error: event.message }),
      };
  }
};
