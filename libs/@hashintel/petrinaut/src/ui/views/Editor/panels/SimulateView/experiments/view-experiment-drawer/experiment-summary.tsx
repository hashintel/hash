/**
 * The drawer's summary: a strip of stats with a status dot, the compute
 * activity underneath, and the error text when the experiment failed.
 */
import { type ReactNode, useEffect, useState } from "react";

import { css } from "@hashintel/ds-helpers/css";

import {
  type ExperimentRecord,
  getExperimentElapsedMs,
  isExperimentActive,
} from "../../../../../../../react/experiments/context";
import { formatDurationMs } from "../format-duration";
import { formatNumber } from "../shared/format-number";
import { ComputeActivity } from "./compute-activity";

const summaryStyle = css({
  marginTop: "-1",
  marginBottom: "3",
});

// Every stat carries its own leading hairline, and the strip shifts left by
// exactly one divider-plus-gap so each row's first divider lands outside the
// clipping wrapper — wrapped rows therefore start flush, not with a floating
// rule (a sibling selector cannot see flex line breaks).
const stripClipStyle = css({
  overflow: "hidden",
});

const stripStyle = css({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  rowGap: "2",
  marginLeft: "[-17px]",
});

const statStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[1px]",
  minWidth: "[0]",
  paddingLeft: "4",
  marginLeft: "[1px]",
  borderLeftWidth: "[1px]",
  borderLeftStyle: "solid",
  borderLeftColor: "neutral.bd.subtle",
  paddingRight: "4",
});

const statLabelStyle = css({
  fontSize: "[10px]",
  fontWeight: "medium",
  letterSpacing: "[0.04em]",
  textTransform: "uppercase",
  color: "neutral.s70",
});

const statValueStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
  fontVariantNumeric: "tabular-nums",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

// Inline-block inside the value span, so a long value still ellipsizes (a
// flex value container turns its text into an item ellipsis cannot reach).
const statusDotStyle = css({
  display: "inline-block",
  width: "[7px]",
  height: "[7px]",
  borderRadius: "full",
  marginRight: "1.5",
  verticalAlign: "[1px]",
  backgroundColor: "neutral.s60",
  "&[data-tone=active]": { backgroundColor: "blue.s100" },
  "&[data-tone=done]": { backgroundColor: "green.s90" },
  "&[data-tone=error]": { backgroundColor: "red.s100" },
});

const activityStyle = css({
  marginTop: "2",
});

const errorStyle = css({
  fontSize: "sm",
  color: "red.s100",
  whiteSpace: "pre-wrap",
});

const STATUS_DISPLAY: Record<
  ExperimentRecord["status"],
  { label: string; tone: "active" | "done" | "error" | "neutral" }
> = {
  initializing: { label: "Initializing", tone: "active" },
  running: { label: "Running", tone: "active" },
  idle: { label: "Idle", tone: "neutral" },
  complete: { label: "Complete", tone: "done" },
  error: { label: "Error", tone: "error" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/**
 * A clock that advances while `active`, so an elapsed-time readout keeps
 * moving even when a stalled run stops publishing progress.
 */
const useNow = (active: boolean): number => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      return;
    }
    const update = () => setNow(Date.now());
    update();
    const intervalId = window.setInterval(update, 250);
    return () => window.clearInterval(intervalId);
  }, [active]);

  return now;
};

const Stat = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className={statStyle}>
    <span className={statLabelStyle}>{label}</span>
    <span className={statValueStyle}>{children}</span>
  </div>
);

export const ExperimentSummary = ({
  experiment,
}: {
  experiment: ExperimentRecord;
}) => {
  const progress = experiment.progress;
  const now = useNow(isExperimentActive(experiment));
  const elapsedMs = getExperimentElapsedMs(experiment, now);
  const status = STATUS_DISPLAY[experiment.status];

  return (
    <div className={summaryStyle}>
      <div className={stripClipStyle}>
        <div className={stripStyle}>
          <Stat label="Status">
            <span className={statusDotStyle} data-tone={status.tone} />
            {status.label}
          </Stat>
          <Stat label="Scenario">{experiment.scenarioName ?? "Default"}</Stat>
          <Stat label="Runs">
            {progress
              ? `${progress.activeRuns} active, ${progress.completedRuns} complete`
              : experiment.runCount}
          </Stat>
          {(progress?.erroredRuns ?? 0) > 0 ? (
            <Stat label="Errors">{progress?.erroredRuns}</Stat>
          ) : null}
          <Stat label="Time">
            {formatNumber(progress?.time ?? 0)} /{" "}
            {formatNumber(experiment.maxTime)}
          </Stat>
          {/* Wall-clock, as distinct from the simulated time; dashed out
              when stepping never began. */}
          <Stat label={experiment.finishedAt === null ? "Elapsed" : "Duration"}>
            {elapsedMs === null ? "—" : formatDurationMs(elapsedMs)}
          </Stat>
        </div>
      </div>
      <div className={activityStyle}>
        <ComputeActivity
          sweepBatches={experiment.sweepBatches}
          sweep={experiment.sweep}
          progress={experiment.progress}
          runCount={experiment.runCount}
          maxTime={experiment.maxTime}
        />
      </div>
      {experiment.error ? (
        <span className={errorStyle}>{experiment.error}</span>
      ) : null}
    </div>
  );
};
