import type { MonteCarloUserDefinedMetricFrame } from "../metrics";
import type {
  MonteCarloExperiment,
  MonteCarloExperimentEvent,
  MonteCarloExperimentRunResults,
} from "./experiment";

export type ExperimentCompletion = {
  /** The first terminal event: complete, cancelled or error. */
  event: MonteCarloExperimentEvent;
  /** The metric frames the handle held when it ended. */
  frames: readonly MonteCarloUserDefinedMetricFrame[];
  /** Per-run metric values, for backends that report them. */
  runResults: MonteCarloExperimentRunResults;
};

/**
 * Starts a handle, waits for its first terminal event, snapshots what it
 * produced and disposes it.
 *
 * Stopping a running batch early is the caller's job: call `handle.cancel()`
 * and this resolves with the `cancelled` event. `onRunResults` fires on every
 * per-run values update while the batch runs, for consumers that paint
 * partial results.
 */
export async function runExperimentToCompletion(
  handle: MonteCarloExperiment,
  options: {
    onRunResults?: (results: MonteCarloExperimentRunResults) => void;
  } = {},
): Promise<ExperimentCompletion> {
  const terminal = new Promise<MonteCarloExperimentEvent>((resolve) => {
    const off = handle.events.subscribe((event) => {
      off();
      resolve(event);
    });
  });
  const offRunResults = options.onRunResults
    ? handle.runResults.subscribe(() => {
        options.onRunResults?.(handle.runResults.get());
      })
    : null;
  try {
    handle.start();
    const event = await terminal;
    return {
      event,
      frames: handle.metrics.get().frames,
      runResults: handle.runResults.get(),
    };
  } finally {
    offRunResults?.();
    handle.dispose();
  }
}
