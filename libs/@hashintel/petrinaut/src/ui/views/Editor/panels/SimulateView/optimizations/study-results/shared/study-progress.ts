/**
 * A study's progress as the frame's header shows it: steps finished over
 * steps requested for the bar, and the batches computing right now, each
 * named, for the computing chip.
 */
import {
  type ConnectedStudyState,
  finishedTrialCount,
  type OptimizationBatchStatus,
  type OptimizationRecord,
} from "../../../../../../../../react/optimizations/context";
import { formatParameters } from "../../../shared/format-value";

import type { ComputeBatch } from "../../../shared/drawer-frame";

/** The header bar: steps finished over steps requested, 0 to 100. */
export const stepsProgressPercent = (
  optimization: Pick<
    OptimizationRecord,
    "completedTrials" | "prunedTrials" | "failedTrials" | "requestedTrials"
  >,
): number =>
  optimization.requestedTrials > 0
    ? Math.min(
        100,
        (finishedTrialCount(optimization) / optimization.requestedTrials) * 100,
      )
    : 0;

/** A batch as the computing list names it: "Step 4", or "Refining population=1850, infected_ratio=0.36". */
export const describeBatch = (batch: OptimizationBatchStatus): string =>
  batch.kind === "trial"
    ? `Step ${batch.trial + 1}`
    : `Refining ${formatParameters(batch.values)}`;

/** The study's batches as the computing list shows them; steps are the priority work. */
export const activityBatches = (
  connected: ConnectedStudyState | null,
): ComputeBatch[] =>
  (connected?.activity ?? []).map((batch) => ({
    id: String(batch.id),
    label: describeBatch(batch),
    tone: batch.kind === "trial" ? "priority" : "background",
    runCount: batch.runCount,
    completedRuns: batch.completedRuns,
  }));
