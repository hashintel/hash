import { use, useState } from "react";

import { Button, Drawer, Icon } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import {
  ExperimentsContext,
  type ExperimentRecord,
} from "../../../../../../react/experiments/context";
import { Section, SectionList } from "../../../../../components/section";
import {
  ExperimentMetricTimeline,
  type MetricSize,
} from "./experiment-metric-timeline";

const summaryGridStyle = css({
  display: "grid",
  gridTemplateColumns: "[repeat(2, minmax(0, 1fr))]",
  gap: "3",
});

const statStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
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
    case "complete":
      return "Complete";
    case "error":
      return "Error";
    case "cancelled":
      return "Cancelled";
  }
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

  return (
    <>
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
    </>
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
          <Section title="Summary" collapsible defaultOpen>
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
