import { use, useEffect, useState } from "react";

import { Button, Drawer, Icon, Tooltip } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import {
  ExperimentsContext,
  type ExperimentRecord,
  getExperimentElapsedMs,
  isExperimentActive,
} from "../../../../../../react/experiments/context";
import { Section, SectionList } from "../../../../../components/section";
import {
  ExperimentMetricTimeline,
  type MetricSize,
} from "./experiment-metric-timeline";
import { formatDurationMs } from "./format-duration";

/**
 * Which backend ran an experiment.
 *
 * Local rather than the design system's `Badge`, whose default tone measured
 * 2.3:1 against this surface — below the 4.5:1 needed for text this size.
 */
const backendBadgeStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  paddingX: "1.5",
  paddingY: "[2px]",
  borderRadius: "sm",
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s110",
  backgroundColor: "neutral.s10",
  "&[data-tone=active]": {
    color: "blue.s100",
    backgroundColor: "blue.s10",
  },
});

const summaryStyle = css({
  marginTop: "-1",
  marginBottom: "3",
});

const summaryGridStyle = css({
  display: "grid",
  gridTemplateColumns: "[repeat(2, minmax(0, 1fr))]",
  gap: "3",
});

const statStyle = css({
  display: "flex",
  flexDirection: "column",
});

const statLabelStyle = css({
  fontSize: "xs",
  fontWeight: "medium",
  color: "neutral.s80",
});

const statValueStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const progressBarStyle = css({
  height: "[6px]",
  width: "full",
  backgroundColor: "neutral.s30",
  borderRadius: "full",
  overflow: "hidden",
  marginTop: "4",
});

const progressFillStyle = css({
  height: "full",
  backgroundColor: "neutral.s120",
});

const errorStyle = css({
  fontSize: "sm",
  color: "red.s100",
  whiteSpace: "pre-wrap",
});

const metricGridStyle = css({
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  alignItems: "start",
  gap: "3",
});

const metricItemStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  minWidth: "[0]",
  padding: "3",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "md",
  backgroundColor: "neutral.s00",
});

const metricItemLargeStyle = css({
  gridColumn: "[1 / -1]",
});

type MetricFrame = ExperimentRecord["metricFrames"][number];

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function formatStatus(experiment: ExperimentRecord): string {
  switch (experiment.status) {
    case "initializing":
      return "Initializing";
    case "running":
      return "Running";
    case "idle":
      return "Idle";
    case "complete":
      return "Complete";
    case "error":
      return "Error";
    case "cancelled":
      return "Cancelled";
  }
}

function describeComputeBackend(experiment: ExperimentRecord): string {
  if (experiment.computeBackend === "webgpu") {
    return "Stepped on the GPU through WebGPU. Results are statistically equivalent to the CPU backend, but not identical for a given seed — the two use different random generators.";
  }

  if (experiment.computeBackendFallbackReason !== null) {
    // Otherwise this only ever appeared in a notification, which is gone by the
    // time anyone looks at the results and wonders why they are not GPU-backed.
    return `The GPU backend was requested but could not run this net: ${experiment.computeBackendFallbackReason}`;
  }

  return "Stepped on the CPU, across worker threads.";
}

const ComputeBackendBadge = ({
  experiment,
}: {
  experiment: ExperimentRecord;
}) => {
  const isGpu = experiment.computeBackend === "webgpu";

  return (
    <Tooltip content={describeComputeBackend(experiment)} position="bottom-end">
      {/* The same pill the experiments table and the active-experiments popover
          use for status. The design system's own `Badge` was the obvious choice,
          but its `brand` scheme puts #5EB1EF on a near-white #FBFDFF — about
          2.3:1, below the 4.5:1 WCAG AA needs for text this size. */}
      <span
        className={backendBadgeStyle}
        data-tone={isGpu ? "active" : "neutral"}
      >
        {isGpu ? <Icon name="lightning" size="xs" /> : null}
        {isGpu ? "GPU" : "CPU"}
      </span>
    </Tooltip>
  );
};

/**
 * Returns a clock that advances while `active`, so an elapsed-time readout keeps
 * moving.
 *
 * The experiment's own progress events already re-render this panel often enough
 * to animate a timer — but they stop arriving if a run stalls, and that is
 * exactly when someone is watching the clock.
 */
function useNow(active: boolean): number {
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
}

function groupMetricFramesByMetric(
  metricFrames: readonly MetricFrame[],
): MetricFrame[][] {
  const groups = new Map<string, MetricFrame[]>();

  for (const frame of metricFrames) {
    const frames = groups.get(frame.metricId) ?? [];
    frames.push(frame);
    groups.set(frame.metricId, frames);
  }

  return [...groups.values()];
}

const ExperimentSummary = ({
  experiment,
}: {
  experiment: ExperimentRecord;
}) => {
  const progress = experiment.progress;
  const progressPercent =
    progress && experiment.maxTime > 0
      ? Math.min(100, (progress.time / experiment.maxTime) * 100)
      : 0;
  const now = useNow(isExperimentActive(experiment));
  const elapsedMs = getExperimentElapsedMs(experiment, now);
  const hasFinished = experiment.finishedAt !== null;

  return (
    <div className={summaryStyle}>
      <div className={summaryGridStyle}>
        <div className={statStyle}>
          <span className={statLabelStyle}>Status</span>
          <span className={statValueStyle}>{formatStatus(experiment)}</span>
        </div>
        <div className={statStyle}>
          <span className={statLabelStyle}>Scenario</span>
          <span className={statValueStyle}>
            {experiment.scenarioName ?? "Default"}
          </span>
        </div>
        <div className={statStyle}>
          <span className={statLabelStyle}>Runs</span>
          <span className={statValueStyle}>
            {progress
              ? `${progress.activeRuns} active, ${progress.completedRuns} complete`
              : experiment.runCount}
          </span>
        </div>
        <div className={statStyle}>
          <span className={statLabelStyle}>Errors</span>
          <span className={statValueStyle}>{progress?.erroredRuns ?? 0}</span>
        </div>
        <div className={statStyle}>
          <span className={statLabelStyle}>Frame</span>
          <span className={statValueStyle}>{progress?.frameNumber ?? 0}</span>
        </div>
        <div className={statStyle}>
          <span className={statLabelStyle}>Time</span>
          <span className={statValueStyle}>
            {formatNumber(progress?.time ?? 0)} /{" "}
            {formatNumber(experiment.maxTime)}
          </span>
        </div>
        <div className={statStyle}>
          <span className={statLabelStyle}>
            {hasFinished ? "Duration" : "Elapsed"}
          </span>
          <span className={statValueStyle}>
            {/* Wall-clock, as distinct from the simulated "Time" above it. Dashed
                out rather than shown as zero when stepping never began. */}
            {elapsedMs === null ? "—" : formatDurationMs(elapsedMs)}
          </span>
        </div>
      </div>
      <div className={progressBarStyle}>
        <div
          className={progressFillStyle}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      {experiment.error ? (
        <span className={errorStyle}>{experiment.error}</span>
      ) : null}
    </div>
  );
};

const ExperimentMetrics = ({
  experiment,
}: {
  experiment: ExperimentRecord;
}) => {
  const [sizes, setSizes] = useState<Record<string, MetricSize>>({});
  const metricFrameGroups = groupMetricFramesByMetric(experiment.metricFrames);

  if (metricFrameGroups.length === 0) {
    return null;
  }

  return (
    <div className={metricGridStyle}>
      {metricFrameGroups.map((frames) => {
        const latestFrame = frames.at(-1)!;
        const size = sizes[latestFrame.metricId] ?? "small";

        return (
          <div
            key={latestFrame.metricId}
            className={cx(
              metricItemStyle,
              size === "large" && metricItemLargeStyle,
            )}
          >
            <ExperimentMetricTimeline
              frames={frames}
              displaySize={size}
              onDisplaySizeChange={(nextSize) =>
                setSizes((previous) => ({
                  ...previous,
                  [latestFrame.metricId]: nextSize,
                }))
              }
            />
          </div>
        );
      })}
    </div>
  );
};

export const ViewExperimentDrawer = ({
  open,
  onClose,
  experiment,
}: {
  open: boolean;
  onClose: () => void;
  experiment: ExperimentRecord | undefined;
}) => {
  const { cancelExperiment, removeExperiment } = use(ExperimentsContext);

  if (!open || !experiment) {
    return null;
  }

  const canCancel =
    experiment.status === "initializing" || experiment.status === "running";

  return (
    <Drawer
      size="xl"
      showBackdrop={false}
      onClose={onClose}
      swapKey="experiment"
    >
      <Drawer.Header
        title={experiment.name}
        description="Monte Carlo experiment metrics"
      />
      <Drawer.Body className={css({ paddingTop: "[0]" })}>
        <SectionList>
          <Section
            title="Summary"
            collapsible
            defaultOpen
            // In the header rather than the grid below, so which backend ran
            // stays visible when the section is collapsed.
            renderHeaderAction={() => (
              <ComputeBackendBadge experiment={experiment} />
            )}
          >
            <ExperimentSummary experiment={experiment} />
          </Section>
          {experiment.metricFrames.length > 0 ? (
            <Section title="Metrics" collapsible defaultOpen>
              <ExperimentMetrics experiment={experiment} />
            </Section>
          ) : null}
        </SectionList>
      </Drawer.Body>
      <Drawer.Footer
        actions={
          <>
            <Button
              variant="subtle"
              tone="neutral"
              size="sm"
              prefix={<Icon name="trash" size="sm" />}
              onClick={() => {
                removeExperiment(experiment.id);
                onClose();
              }}
            >
              Remove
            </Button>
            {canCancel ? (
              <Button
                variant="subtle"
                tone="neutral"
                size="sm"
                prefix={<Icon name="stop" size="sm" />}
                onClick={() => cancelExperiment(experiment.id)}
              >
                Cancel
              </Button>
            ) : null}
            <Button variant="solid" tone="neutral" size="sm" onClick={onClose}>
              Close
            </Button>
          </>
        }
      />
    </Drawer>
  );
};
