/**
 * The study frame's stats line: the status pill, the steps finished over the
 * steps requested (with the runs per step and the steps at once when above
 * one), the steps clear for a study with constraints, the best value so far
 * (hover it for the best step's parameters), and the chip listing what
 * computes for a study evaluated here. Every value reserves its width.
 */
import { Tooltip } from "@hashintel/ds-components";

import {
  constraintAlpha,
  formatRate,
  studyConstraintRates,
} from "../../../../../../../react/optimizations/constraint-rates";
import {
  ComputeBatchesChip,
  FrameStat,
  FrameStatusPill,
  type FrameStatusTone,
} from "../../shared/drawer-frame";
import { formatNumber, formatParameters } from "../../shared/format-value";
import { describeOptimizationStatus } from "../optimization-status";
import { activityBatches, finishedStepCount } from "./shared/study-progress";

import type { OptimizationRecord } from "../../../../../../../react/optimizations/context";

const STATUS_TONE: Record<OptimizationRecord["status"], FrameStatusTone> = {
  initializing: "active",
  running: "active",
  paused: "neutral",
  complete: "done",
  error: "error",
  cancelled: "neutral",
};

/** Longest status word plus the dot, so the pill never reflows as it changes. */
const STATUS_CHARS = "Reconnecting".length + 2;

/** "4 / 30 · 3 runs each · 2 at once", with the parts that are 1 left out. */
export const describeStepProgress = (
  optimization: Pick<
    OptimizationRecord,
    | "completedTrials"
    | "prunedTrials"
    | "failedTrials"
    | "requestedTrials"
    | "connected"
    | "input"
  >,
): string => {
  const runsPerStep = optimization.input.execution.seedsPerTrial ?? 1;
  const parallelism = optimization.connected?.parallelism ?? 1;
  return [
    `${finishedStepCount(optimization)} / ${optimization.requestedTrials}`,
    ...(runsPerStep > 1 ? [`${runsPerStep} runs each`] : []),
    ...(parallelism > 1 ? [`${parallelism} at once`] : []),
  ].join(" · ");
};

/** The status word; a run whose event stream is being re-established says so instead. */
export const describeStudyStatus = (
  optimization: Pick<
    OptimizationRecord,
    "status" | "connected" | "connectionState"
  >,
): string =>
  optimization.connectionState === "reconnecting"
    ? "Reconnecting"
    : describeOptimizationStatus(optimization);

export const StudyStats = ({
  optimization,
}: {
  optimization: OptimizationRecord;
}) => {
  const { connected } = optimization;
  const constrained = (optimization.input.constraints ?? []).length > 0;
  const rates = constrained
    ? studyConstraintRates(
        optimization.trials,
        constraintAlpha(optimization.input),
      )
    : null;

  return (
    <>
      <FrameStatusPill
        tone={STATUS_TONE[optimization.status]}
        minChars={STATUS_CHARS}
      >
        {describeStudyStatus(optimization)}
      </FrameStatusPill>
      <FrameStat
        label="Steps"
        minChars={
          describeStepProgress({
            ...optimization,
            completedTrials: optimization.requestedTrials,
            prunedTrials: 0,
            failedTrials: 0,
          }).length
        }
      >
        {describeStepProgress(optimization)}
      </FrameStat>
      {rates === null ? null : (
        <FrameStat
          label="Steps clear"
          minChars={
            formatRate(
              optimization.requestedTrials,
              optimization.requestedTrials,
            ).length
          }
        >
          {formatRate(rates.stepsClear, rates.stepsSimulated)}
        </FrameStat>
      )}
      <FrameStat label="Best step so far" minChars={8}>
        {optimization.best ? (
          <Tooltip
            content={formatParameters(optimization.best.parameters)}
            position="bottom-start"
          >
            <span>{formatNumber(optimization.best.objective)}</span>
          </Tooltip>
        ) : (
          "—"
        )}
      </FrameStat>
      {connected ? (
        <ComputeBatchesChip batches={activityBatches(connected)} />
      ) : null}
    </>
  );
};
