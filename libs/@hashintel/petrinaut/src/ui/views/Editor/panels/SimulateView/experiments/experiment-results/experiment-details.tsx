import { Fragment, type ReactNode, useRef, useState } from "react";

import { Button, Popover, Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ComputeBackendBadge } from "../../shared/compute-backend-badge";
import { ComputeBatchesChip } from "../../shared/drawer-frame";
import { formatCount } from "../../shared/format-value";

import type { ExperimentRecord } from "../../../../../../../react/experiments/context";
import type { ComputeBatch } from "../../shared/drawer-frame";
import type { ResultsStat } from "../../shared/results-model";

export type ExperimentDetail = Pick<ResultsStat, "id" | "label" | "value">;

const bodyStyle = css({
  width: "[360px]",
  maxWidth: "[calc(100vw - 48px)]",
  display: "flex",
  flexDirection: "column",
  gap: "3",
  fontSize: "xs",
});

const listStyle = css({
  display: "grid",
  gridTemplateColumns: "auto minmax(0, 1fr)",
  columnGap: "4",
  rowGap: "2",
  margin: "0",
  "& dt": { color: "neutral.s90" },
  "& dd": {
    margin: "0",
    textAlign: "right",
    overflowWrap: "anywhere",
    fontVariantNumeric: "tabular-nums",
    color: "neutral.s120",
  },
});

const helpStyle = css({ color: "neutral.s90", margin: "0" });

export const ExperimentDetails = ({
  experiment,
  stats,
  batches,
  children,
}: {
  experiment: ExperimentRecord;
  stats: readonly ExperimentDetail[];
  batches: readonly ComputeBatch[];
  children: ReactNode;
}) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="xs"
        aria-label="Experiment details"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
      >
        Details
      </Button>
      {open ? (
        <Popover
          triggerRef={triggerRef}
          position="bottom-end"
          onClose={() => setOpen(false)}
        >
          <Popover.Container>
            <Popover.Header title="Experiment details" />
            <Popover.Body className={bodyStyle}>
              <dl className={listStyle}>
                <dt>Scenario</dt>
                <dd>{experiment.scenarioName ?? "Default scenario"}</dd>
                <dt>
                  {experiment.sweep ? "Sampling limit" : "Requested runs"}
                </dt>
                <dd>{formatCount(experiment.runCount)} runs</dd>
                {stats.map((stat) => (
                  <Fragment key={stat.id}>
                    <dt>{stat.label}</dt>
                    <dd>
                      {stat.value.tooltip ? (
                        <Tooltip content={stat.value.tooltip}>
                          <span>{stat.value.text}</span>
                        </Tooltip>
                      ) : (
                        stat.value.text
                      )}
                    </dd>
                  </Fragment>
                ))}
                <dt>Compute</dt>
                <dd>
                  <ComputeBackendBadge backend={experiment} />
                </dd>
                {batches.length > 0 ? (
                  <>
                    <dt>Active batches</dt>
                    <dd>
                      <ComputeBatchesChip batches={batches} />
                    </dd>
                  </>
                ) : null}
              </dl>
              {experiment.sweep ? (
                <p className={helpStyle}>
                  The sampling limit applies to the selected parameter values.
                  Moving a slider starts sampling the new selection.
                </p>
              ) : null}
              {children}
            </Popover.Body>
          </Popover.Container>
        </Popover>
      ) : null}
    </>
  );
};
