import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { use, useState } from "react";

import { Button } from "../../../../components/button";
import { Drawer } from "../../../../components/drawer";
import { Section, SectionList } from "../../../../components/section";
import {
  ExperimentsContext,
  type ExperimentRecord,
} from "../../../../../react/experiments/context";
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

  return (
    <Drawer.Root open={open} onClose={onClose} className={drawerStyle}>
      <Drawer.Card onClose={onClose}>
        <Drawer.Header description="Monte Carlo token-count distributions streamed from the worker">
          {experiment.name}
        </Drawer.Header>
        <Drawer.Body className={bodyStyle}>
          <SectionList>
            <Section title="Summary" collapsible defaultOpen>
              <ExperimentSummary experiment={experiment} />
            </Section>
            <Section title="Token counts" collapsible defaultOpen>
              <ExperimentTimeline
                experiment={experiment}
                placeId={selectedPlaceId}
                onPlaceIdChange={setSelectedPlaceId}
              />
            </Section>
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
