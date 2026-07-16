import { use, useRef, useState } from "react";

import { Button, Icon, Popover } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import {
  ExperimentsContext,
  isExperimentActive,
  type ExperimentRecord,
} from "../../../../../react/experiments/context";
import { TableStatusBadge } from "../../../../components/table";

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
  maxHeight: "[280px]",
  overflowY: "auto",
  borderRadius: "[inherit]",
});

const rowStyle = css({
  display: "grid",
  gridTemplateColumns: "[minmax(0, 1fr) auto]",
  gap: "2",
  alignItems: "center",
  paddingX: "3",
  paddingY: "2",
  borderBottomWidth: "[1px]",
  borderBottomStyle: "solid",
  borderBottomColor: "neutral.bd.subtle",
  background: "[none]",
  borderTop: "[none]",
  borderLeft: "[none]",
  borderRight: "[none]",
  borderRadius: "[inherit]",
  textAlign: "left",
  width: "full",
  _hover: {
    backgroundColor: "neutral.s10",
  },
  _last: {
    borderBottomWidth: "[0]",
  },
});

const clickableRowStyle = css({
  cursor: "pointer",
});

const rowMainStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[2px]",
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
  return status === "initializing" ? "Initializing" : "Running";
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

const ExperimentStatusBadge = ({
  status,
}: {
  status: ExperimentRecord["status"];
}) => (
  <TableStatusBadge loading tone="active">
    {formatStatus(status)}
  </TableStatusBadge>
);

type RunningExperimentsPopoverProps = {
  onExperimentClick?: (experiment: ExperimentRecord) => void;
};

export const RunningExperimentsPopover = ({
  onExperimentClick,
}: RunningExperimentsPopoverProps) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const { experiments } = use(ExperimentsContext);
  const activeExperiments = experiments.filter(isExperimentActive);

  if (activeExperiments.length === 0) {
    return null;
  }

  const countLabel = `${activeExperiments.length} active`;

  return (
    <>
      <Button
        ref={triggerRef}
        size="md"
        variant="ghost"
        aria-label={`Show ${countLabel} Monte Carlo simulations`}
        tooltip="Active Experiments"
        prefix={<Icon name="flask" size="sm" />}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span className={triggerCountStyle}>{countLabel}</span>
      </Button>
      {open && (
        <Popover
          triggerRef={triggerRef}
          position="bottom-end"
          onClose={() => setOpen(false)}
        >
          <Popover.Container className={contentWidthStyle}>
            <Popover.Header title="Active Experiments" />
            <Popover.Body withPadding={false}>
              <div className={listStyle}>
                {activeExperiments.map((experiment) => {
                  const rowContent = (
                    <>
                      <div className={rowMainStyle}>
                        <span className={experimentNameStyle}>
                          {experiment.name}
                        </span>
                        <span className={experimentMetaStyle}>
                          {experiment.scenarioName ?? "Default"} -{" "}
                          {formatProgress(experiment)}
                        </span>
                      </div>
                      <ExperimentStatusBadge status={experiment.status} />
                      <div className={progressBarStyle}>
                        <div
                          className={progressFillStyle}
                          style={{
                            width: `${getProgressPercent(experiment)}%`,
                          }}
                        />
                      </div>
                    </>
                  );

                  if (onExperimentClick) {
                    return (
                      <button
                        key={experiment.id}
                        type="button"
                        className={cx(rowStyle, clickableRowStyle)}
                        onClick={() => {
                          setOpen(false);
                          onExperimentClick(experiment);
                        }}
                      >
                        {rowContent}
                      </button>
                    );
                  }

                  return (
                    <div key={experiment.id} className={rowStyle}>
                      {rowContent}
                    </div>
                  );
                })}
              </div>
            </Popover.Body>
          </Popover.Container>
        </Popover>
      )}
    </>
  );
};
