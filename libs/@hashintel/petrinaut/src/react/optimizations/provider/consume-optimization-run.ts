import { foldBestTrial, type OptimizationBest } from "../context";

import type {
  PetrinautOptimizationDirection,
  PetrinautOptimizationEvent,
} from "@hashintel/petrinaut-core";
import type { PetrinautConnectedOptimizationCapability } from "@hashintel/petrinaut-core/optimization";

export const isAbortError = (error: unknown): boolean =>
  (error instanceof DOMException && error.name === "AbortError") ||
  (error instanceof Error && error.name === "AbortError");

/**
 * Consumes a run's event stream until its terminal event. Replayed events
 * at or below the last applied `seq` are skipped so trials are never
 * double-counted. Aborting before the terminal event reports the run as
 * cancelled; a thrown error fails it.
 *
 * `best` is the best step folded so far, by the record's own fold: the record
 * in state may still be a render behind the trial before it.
 */
export const consumeOptimizationRun = async ({
  capability,
  runId,
  direction,
  signal,
  onEvent,
  onCancelled,
  onFailed,
}: {
  capability: PetrinautConnectedOptimizationCapability;
  runId: string;
  /** The objective's direction, which decides the best step among the trials. */
  direction: PetrinautOptimizationDirection;
  signal: AbortSignal;
  onEvent: (
    event: PetrinautOptimizationEvent,
    lastSeq: number,
    best: OptimizationBest | null,
  ) => void;
  onCancelled: () => void;
  onFailed: (error: unknown, best: OptimizationBest | null) => void;
}): Promise<void> => {
  let lastSeq = 0;
  let best: OptimizationBest | null = null;
  let sawTerminalEvent = false;
  try {
    for await (const event of capability.attachOptimizationRun(runId, {
      cursor: lastSeq,
      signal,
    })) {
      if (signal.aborted) {
        break;
      }
      if (typeof event.seq === "number") {
        if (event.seq <= lastSeq) {
          continue;
        }
        lastSeq = event.seq;
      }
      if (event.type === "trial") {
        best = foldBestTrial(direction, best, event);
      }
      if (event.type === "complete" || event.type === "error") {
        sawTerminalEvent = true;
      }
      onEvent(event, lastSeq, best);
    }
    if (signal.aborted && !sawTerminalEvent) {
      onCancelled();
    }
  } catch (error) {
    if (signal.aborted || isAbortError(error)) {
      onCancelled();
    } else if (!sawTerminalEvent) {
      // After the terminal event the run has settled, and a trailing hiccup
      // changes nothing.
      onFailed(error, best);
    }
  }
};
