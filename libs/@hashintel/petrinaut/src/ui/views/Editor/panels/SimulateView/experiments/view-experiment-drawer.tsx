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
  type PlotCrossfade,
} from "./experiment-metric-timeline";
import { formatDurationMs } from "./format-duration";
import { SweepNavigator } from "./sweep-navigator";
import { SweepSurface } from "./sweep-surface";

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
  gridTemplateColumns: "[repeat(3, minmax(0, 1fr))]",
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
  marginTop: "2",
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

// The drawer body is a column: the summary, the navigator, and the surface
// hold still at the top, and the metric charts alone scroll below them.
const drawerBodyStyle = css({
  paddingTop: "[0]",
  display: "flex",
  flexDirection: "column",
});

const fixedSectionStyle = css({
  flexShrink: "0",
});

const metricsScrollStyle = css({
  flex: "[1]",
  minHeight: "[160px]",
  overflowY: "auto",
  scrollbarWidth: "[thin]",
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
    return "Stepped on the GPU through WebGPU. Distributions match the CPU backend statistically; individual trajectories differ (different random generators).";
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
        {(progress?.erroredRuns ?? 0) > 0 ? (
          <div className={statStyle}>
            <span className={statLabelStyle}>Errors</span>
            <span className={statValueStyle}>{progress?.erroredRuns}</span>
          </div>
        ) : null}
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

/**
 * How the charts bridge a sweep selection change: the previous picture is
 * snapshotted and persists through the compute gap — dimmed ("dim") or
 * as-is ("hold") — then fades out over ~300 ms as the new selection's
 * first frames render. "off" cuts to the empty shells.
 */
export type RestreamGhost = PlotCrossfade;

const ExperimentMetrics = ({
  experiment,
  restreamGhost,
}: {
  experiment: ExperimentRecord;
  restreamGhost: RestreamGhost;
}) => {
  const [sizes, setSizes] = useState<Record<string, MetricSize>>({});
  const metricFrameGroups = groupMetricFramesByMetric(experiment.metricFrames);
  const labelById = new Map(
    experiment.metricSpecs.map((spec) => [spec.id, spec.label]),
  );
  // What the frames represent: a selection change crossfades the previous
  // picture inside each plot instead of cutting to the sparse new stream.
  const contentEpoch = JSON.stringify(experiment.sweep?.selection ?? null);

  return (
    <div className={metricGridStyle}>
      {metricFrameGroups.length > 0
        ? metricFrameGroups.map((frames) => {
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
                  label={labelById.get(latestFrame.metricId)}
                  timeDomain={[0, experiment.maxTime]}
                  contentEpoch={contentEpoch}
                  crossfade={restreamGhost}
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
          })
        : // No frames have ever arrived: stable shells per configured
          // metric, so the first data causes no layout shift.
          experiment.metricSpecs.map((spec) => {
            const size = sizes[spec.id] ?? "small";
            return (
              <div
                key={spec.id}
                className={cx(
                  metricItemStyle,
                  size === "large" && metricItemLargeStyle,
                )}
              >
                <ExperimentMetricTimeline
                  frames={[]}
                  label={spec.label}
                  timeDomain={[0, experiment.maxTime]}
                  contentEpoch={contentEpoch}
                  crossfade={restreamGhost}
                  displaySize={size}
                  onDisplaySizeChange={(nextSize) =>
                    setSizes((previous) => ({
                      ...previous,
                      [spec.id]: nextSize,
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
  restreamGhost = "dim",
}: {
  open: boolean;
  onClose: () => void;
  experiment: ExperimentRecord | undefined;
  /** Chart behaviour while a sweep restreams; see {@link RestreamGhost}. */
  restreamGhost?: RestreamGhost;
}) => {
  const { cancelExperiment, removeExperiment, setSweepSelection } =
    use(ExperimentsContext);

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
        description={`${experiment.scenarioName ?? "Default scenario"} · ${experiment.runCount.toLocaleString("en-US")} runs · dt ${experiment.dt}`}
      />
      <Drawer.Body className={drawerBodyStyle}>
        <SectionList>
          <Section
            title="Summary"
            collapsible
            defaultOpen
            className={fixedSectionStyle}
            // In the header rather than the grid below, so which backend ran
            // stays visible when the section is collapsed.
            renderHeaderAction={() => (
              <ComputeBackendBadge experiment={experiment} />
            )}
          >
            <ExperimentSummary experiment={experiment} />
          </Section>
          {experiment.sweep ? (
            <Section
              title="Parameters"
              tooltip="Only the selected combination computes. Move a control and compute follows it; results for visited combinations are kept."
              className={fixedSectionStyle}
              // Not collapsible: the navigator stays usable while the charts
              // below stream.
              renderStickyBand={() =>
                experiment.sweep ? (
                  <SweepNavigator
                    axes={experiment.parameterAxes}
                    selection={experiment.sweep.selection}
                    status={{
                      computing: experiment.sweep.computing,
                      runsCompleted: experiment.sweep.runsCompleted,
                      runsSampled: experiment.sweep.runsSampled,
                      runTarget: experiment.sweep.runTarget,
                      runCount: experiment.runCount,
                    }}
                    onSelectionChange={(selection) =>
                      setSweepSelection(experiment.id, selection)
                    }
                  />
                ) : null
              }
            >
              {null}
            </Section>
          ) : null}
          {experiment.sweep && experiment.parameterAxes.length >= 2 ? (
            <Section
              title="Surface"
              tooltip="One metric's final value over two swept parameters, with every other parameter held at the middle of its range."
              collapsible
              defaultOpen
              className={fixedSectionStyle}
            >
              <SweepSurface experiment={experiment} />
            </Section>
          ) : null}
          {experiment.metricSpecs.length > 0 ? (
            <Section title="Metrics" fillHeight>
              <div className={metricsScrollStyle}>
                {/* Keyed so held ghost frames and size choices never leak
                    from one experiment into another when the drawer swaps
                    records in place. */}
                <ExperimentMetrics
                  key={experiment.id}
                  experiment={experiment}
                  restreamGhost={restreamGhost}
                />
              </div>
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
