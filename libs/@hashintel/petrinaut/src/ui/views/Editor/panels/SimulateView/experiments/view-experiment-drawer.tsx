import { use, useState } from "react";

import { Button, Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  ExperimentsContext,
  type ExperimentRecord,
} from "../../../../../../react/experiments/context";
import { Drawer } from "../../../../../components/drawer";
import { Section, SectionList } from "../../../../../components/section";
import { ExperimentTimeline } from "./experiment-timeline";

const bodyStyle = css({
  overflowY: "auto",
});

const drawerStyle = css({
  width: "[min(1080px, calc(90vw - 20px))]",
  maxWidth: "[calc(90vw - 20px)]",
});

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
  gridTemplateColumns: "[repeat(auto-fit, minmax(180px, 1fr))]",
  gap: "3",
});

const metricItemStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  padding: "3",
  borderWidth: "[1px]",
  borderStyle: "solid",
  borderColor: "neutral.bd.subtle",
  borderRadius: "md",
  backgroundColor: "neutral.s00",
});

const metricValueStyle = css({
  fontSize: "lg",
  fontWeight: "semibold",
  color: "neutral.s120",
});

const metricMetaStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
});

const metricSubValueStyle = css({
  fontSize: "xs",
  color: "neutral.s90",
});

const footerSpacerStyle = css({
  flex: "1",
});

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

function hasTokenCountDistributionMetric(
  experiment: ExperimentRecord,
): boolean {
  return experiment.metricSpecs.some(
    (metricSpec) => metricSpec.kind === "placeTokenCountDistribution",
  );
}

function formatMetricFrameValue(
  frame: ExperimentRecord["metricFrames"][number],
): string {
  if (frame.outputType === "distribution") {
    return `${frame.bins.length} bin${frame.bins.length === 1 ? "" : "s"}`;
  }

  return frame.value === null ? "n/a" : formatNumber(frame.value);
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
  const metricFrames = Object.values(experiment.latestMetricFramesById);

  if (metricFrames.length === 0) {
    return null;
  }

  return (
    <div className={metricGridStyle}>
      {metricFrames.map((frame) => (
        <div key={frame.metricId} className={metricItemStyle}>
          <span className={statLabelStyle}>{frame.label}</span>
          <span className={metricValueStyle}>
            {formatMetricFrameValue(frame)}
          </span>
          {frame.outputType === "distribution" ? (
            <span className={metricSubValueStyle}>Distribution</span>
          ) : null}
          <span className={metricMetaStyle}>
            Frame {frame.frameNumber} - {frame.runSampleCount} runs
          </span>
        </div>
      ))}
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
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);

  if (!experiment) {
    return (
      <Drawer.Root open={open} onClose={onClose}>
        {null}
      </Drawer.Root>
    );
  }

  const canCancel =
    experiment.status === "initializing" || experiment.status === "running";
  const showTokenCountDistribution =
    hasTokenCountDistributionMetric(experiment);

  return (
    <Drawer.Root open={open} onClose={onClose} className={drawerStyle}>
      <Drawer.Card onClose={onClose}>
        <Drawer.Header description="Monte Carlo token-count distributions and experiment metrics">
          {experiment.name}
        </Drawer.Header>
        <Drawer.Body className={bodyStyle}>
          <SectionList>
            <Section title="Summary" collapsible defaultOpen>
              <ExperimentSummary experiment={experiment} />
            </Section>
            {showTokenCountDistribution ? (
              <Section title="Token count per place" collapsible defaultOpen>
                <ExperimentTimeline
                  experiment={experiment}
                  placeId={selectedPlaceId}
                  onPlaceIdChange={setSelectedPlaceId}
                />
              </Section>
            ) : null}
            {Object.keys(experiment.latestMetricFramesById).length > 0 ? (
              <Section title="Metrics" collapsible defaultOpen>
                <ExperimentMetrics experiment={experiment} />
              </Section>
            ) : null}
          </SectionList>
        </Drawer.Body>
      </Drawer.Card>
      <Drawer.Footer>
        <div className={footerSpacerStyle} />
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
      </Drawer.Footer>
    </Drawer.Root>
  );
};
