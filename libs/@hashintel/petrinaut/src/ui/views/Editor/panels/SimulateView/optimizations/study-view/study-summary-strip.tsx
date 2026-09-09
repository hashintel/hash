/**
 * A study's summary as one fixed band at the top of its surface, outside the
 * scrolling body: the header line (where the study is, the best step so far,
 * the verdict chip) with the backend badge at its right for a connected
 * study, then status, steps finished over requested and the best value so
 * far in a strip, with the steps bar beneath and the error when there is
 * one. A connected study adds the followed step's runs under the steps bar,
 * the "N computing" chip and the fallback note. A study with constraints
 * adds the steps clear across the study to the strip. The band has no title
 * of its own: it is the drawer's header continued, not a section.
 */
import { Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  constraintAlpha,
  formatRate,
  studyConstraintRates,
} from "../../../../../../../react/optimizations/constraint-rates";
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
import { StudyHeader } from "./study-header";

import type { OptimizationRecord } from "../../../../../../../react/optimizations/context";

const bandStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  flexShrink: "0",
  paddingTop: "2",
  paddingBottom: "3",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
});

const headerRowStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
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
  paused: "neutral",
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

export const StudySummaryBand = ({
  optimization,
}: {
  optimization: OptimizationRecord;
}) => {
  const { connected } = optimization;
  const status = describeOptimizationStatus(optimization);
  const fallbackReason = connected?.computeBackendFallbackReason ?? null;
  const constrained = (optimization.input.constraints ?? []).length > 0;
  const rates = constrained
    ? studyConstraintRates(
        optimization.trials,
        constraintAlpha(optimization.input),
      )
    : null;

  return (
    <div className={bandStyle} data-study-band>
      <div className={headerRowStyle}>
        <StudyHeader optimization={optimization} />
        {connected ? (
          <ComputeBackendBadge
            backend={{
              computeBackend: optimization.computeBackend,
              computeBackendFallbackReason:
                connected.computeBackendFallbackReason,
            }}
          />
        ) : null}
      </div>
      <SummaryStrip>
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
        {rates === null ? null : (
          <SummaryStat
            label="Steps clear"
            minChars={
              formatRate(
                optimization.requestedTrials,
                optimization.requestedTrials,
              ).length
            }
          >
            {formatRate(rates.stepsClear, rates.stepsSimulated)}
          </SummaryStat>
        )}
        <SummaryStat label="Best step so far" minChars={8}>
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
      {optimization.status === "paused" && connected ? (
        <span className={noteStyle} data-resume-note>
          Resuming continues the study's history; it does not reproduce the
          draws an uninterrupted run would have made.
        </span>
      ) : null}
      {optimization.error ? (
        <span className={errorStyle}>{optimization.error}</span>
      ) : null}
    </div>
  );
};
