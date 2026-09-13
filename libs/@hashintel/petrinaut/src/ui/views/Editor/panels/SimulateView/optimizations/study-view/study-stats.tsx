/**
 * The study frame's stat columns: the status pill, the steps finished over
 * the steps requested (with the runs per step and the steps at once when
 * above one), the steps clear for a study with constraints, the best value so
 * far (hover it for the best step's parameters), and the chip listing what
 * computes for a study evaluated here. Every column is as wide as its widest
 * value.
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

/** The longest status word, so the pill never reflows as it changes. */
const WIDEST_STATUS = "Reconnecting";

/** The widest objective `formatNumber` prints: a sign, six significant digits and an exponent. */
const WIDEST_OBJECTIVE = "-0.00000e+00";

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
      <FrameStat label="Status" widest="" align="start">
        <FrameStatusPill
          tone={STATUS_TONE[optimization.status]}
          widest={WIDEST_STATUS}
        >
          {describeStudyStatus(optimization)}
        </FrameStatusPill>
      </FrameStat>
      <FrameStat
        label="Steps"
        widest={describeStepProgress({
          ...optimization,
          completedTrials: optimization.requestedTrials,
          prunedTrials: 0,
          failedTrials: 0,
        })}
      >
        {describeStepProgress(optimization)}
      </FrameStat>
      {rates === null ? null : (
        <FrameStat
          label="Steps clear"
          widest={formatRate(
            optimization.requestedTrials,
            optimization.requestedTrials,
          )}
        >
          {formatRate(rates.stepsClear, rates.stepsSimulated)}
        </FrameStat>
      )}
      <FrameStat label="Best step so far" widest={WIDEST_OBJECTIVE}>
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
        <FrameStat label="Activity" widest="" align="start">
          <ComputeBatchesChip batches={activityBatches(connected)} />
        </FrameStat>
      ) : null}
    </>
  );
};
