import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";

import { Button } from "../../../../components/button";
import { Popover } from "../../../../components/popover";
import {
  ExperimentsContext,
  isExperimentActive,
  type ExperimentRecord,
} from "../../../../../react/experiments/context";

const contentWidthStyle = css({
  width: "[320px]",
});

const triggerCountStyle = css({
  fontSize: "xs",
  fontWeight: "semibold",
  color: "neutral.s120",
});

const listStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[1px]",
  padding: "1",
  maxHeight: "[280px]",
  overflowY: "auto",
});

const rowStyle = css({
  display: "grid",
  gridTemplateColumns: "[minmax(0, 1fr) auto]",
  gap: "2",
  alignItems: "center",
  paddingX: "2",
  paddingY: "2",
  borderRadius: "lg",
  _hover: {
    backgroundColor: "neutral.s10",
  },
});

const rowMainStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[3px]",
  minWidth: "[0]",
});

const experimentNameStyle = css({
  fontSize: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const experimentMetaStyle = css({
  fontSize: "xs",
  color: "neutral.s80",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const statusPillStyle = css({
  display: "inline-flex",
  alignItems: "center",
  gap: "1",
  borderRadius: "full",
  paddingX: "2",
  height: "[22px]",
  backgroundColor: "blue.s20",
  color: "neutral.s120",
  fontSize: "xs",
  fontWeight: "medium",
});

const statusDotStyle = css({
  width: "[6px]",
  height: "[6px]",
  borderRadius: "full",
  backgroundColor: "blue.s60",
  flexShrink: 0,
});

const progressBarStyle = css({
  gridColumn: "[1 / -1]",
  height: "[4px]",
  width: "full",
  backgroundColor: "neutral.s30",
  borderRadius: "full",
  overflow: "hidden",
});

const progressFillStyle = css({
  height: "full",
  backgroundColor: "blue.s60",
});

function formatStatus(status: ExperimentRecord["status"]): string {
  return status === "initializing" ? "Starting" : "Running";
}

function formatProgress(experiment: ExperimentRecord): string {
  const progress = experiment.progress;
  if (!progress) {
    return `${experiment.runCount} runs`;
  }

  return `${progress.activeRuns} active, ${progress.completedRuns} complete, ${progress.erroredRuns} errors`;
}

function getProgressPercent(experiment: ExperimentRecord): number {
  const progress = experiment.progress;
  if (!progress || experiment.maxTime <= 0) {
    return 0;
  }

  return Math.min(100, (progress.time / experiment.maxTime) * 100);
}

export const RunningExperimentsPopover = () => {
  const { experiments } = use(ExperimentsContext);
  const activeExperiments = experiments.filter(isExperimentActive);

  if (activeExperiments.length === 0) {
    return null;
  }

  const countLabel = `${activeExperiments.length} running`;

  return (
    <Popover.Root
      positioning={{ placement: "bottom-end", gutter: 8 }}
      lazyMount
      unmountOnExit
    >
      <Popover.Trigger asChild>
        <Button
          size="md"
          variant="ghost"
          aria-label={`Show ${countLabel} Monte Carlo simulations`}
          tooltip="Running Monte Carlo simulations"
          tooltipDisplay="inline"
          prefix={<Icon name="flask" size="sm" />}
        >
          <span className={triggerCountStyle}>{countLabel}</span>
        </Button>
      </Popover.Trigger>

      <Popover.Content className={contentWidthStyle}>
        <Popover.Header>Running Monte Carlo</Popover.Header>
        <Popover.Section>
          <Popover.SectionCard>
            <Popover.SectionLabel>Active simulations</Popover.SectionLabel>
            <div className={listStyle}>
              {activeExperiments.map((experiment) => (
                <div key={experiment.id} className={rowStyle}>
                  <div className={rowMainStyle}>
                    <span className={experimentNameStyle}>
                      {experiment.name}
                    </span>
                    <span className={experimentMetaStyle}>
                      {experiment.scenarioName ?? "Default"} -{" "}
                      {formatProgress(experiment)}
                    </span>
                  </div>
                  <span className={statusPillStyle}>
                    <span className={statusDotStyle} />
                    {formatStatus(experiment.status)}
                  </span>
                  <div className={progressBarStyle}>
                    <div
                      className={progressFillStyle}
                      style={{ width: `${getProgressPercent(experiment)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Popover.SectionCard>
        </Popover.Section>
      </Popover.Content>
    </Popover.Root>
  );
};
