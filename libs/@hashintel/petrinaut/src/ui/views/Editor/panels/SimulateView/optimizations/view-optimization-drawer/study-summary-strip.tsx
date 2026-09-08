/**
 * A study's summary as one strip: status, steps finished over requested and
 * the best value so far, with the steps bar beneath and the error when there
 * is one. A connected study adds the backend its steps run on, the followed
 * step's runs under the steps bar, the "N computing" chip and the fallback
 * note.
 */
import { Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ComputeActivity } from "../../shared/compute-activity";
import { ComputeBackendBadge } from "../../shared/compute-backend-badge";
import { formatNumber, formatParameters } from "../../shared/format-value";
import {
  SummaryStat,
  SummaryStatusDot,
  type SummaryStatusTone,
  SummaryStrip,
} from "../../shared/summary-strip";
import { describeOptimizationStatus } from "../optimization-status";
import {
  activityBatches,
  finishedStepCount,
  followedStepBar,
  stepsBar,
} from "./shared/study-progress";

import type { OptimizationRecord } from "../../../../../../../react/optimizations/context";

const stripSectionStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  paddingTop: "2.5",
  paddingBottom: "2",
});

const noteStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
});

const errorStyle = css({
  fontSize: "sm",
  color: "red.s100",
  whiteSpace: "pre-wrap",
});

const STATUS_TONE: Record<OptimizationRecord["status"], SummaryStatusTone> = {
  initializing: "active",
  running: "active",
  complete: "done",
  error: "error",
  cancelled: "neutral",
};

/** Longest status label plus the dot, so the strip never reflows as it changes. */
const STATUS_CHARS = "Initializing (reconnecting…)".length;

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

export const StudySummaryStrip = ({
  optimization,
}: {
  optimization: OptimizationRecord;
}) => {
  const { connected } = optimization;
  const status = describeOptimizationStatus(optimization);
  const fallbackReason = connected?.computeBackendFallbackReason ?? null;

  return (
    <div className={stripSectionStyle}>
      <SummaryStrip
        trailing={
          connected ? (
            <ComputeBackendBadge
              backend={{
                computeBackend: optimization.computeBackend,
                computeBackendFallbackReason:
                  connected.computeBackendFallbackReason,
              }}
            />
          ) : undefined
        }
      >
        <SummaryStat label="Status" minChars={STATUS_CHARS}>
          <SummaryStatusDot tone={STATUS_TONE[optimization.status]} />
          {status}
          {optimization.connectionState === "reconnecting"
            ? " (reconnecting…)"
            : ""}
        </SummaryStat>
        <SummaryStat
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
        </SummaryStat>
        <SummaryStat label="Best" minChars={8}>
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
        </SummaryStat>
      </SummaryStrip>
      <ComputeActivity
        bar={stepsBar(optimization)}
        secondaryBar={followedStepBar(optimization)}
        batches={activityBatches(connected)}
      />
      {fallbackReason === null ? null : (
        <span className={noteStyle}>Ran on the CPU: {fallbackReason}</span>
      )}
      {optimization.error ? (
        <span className={errorStyle}>{optimization.error}</span>
      ) : null}
    </div>
  );
};
