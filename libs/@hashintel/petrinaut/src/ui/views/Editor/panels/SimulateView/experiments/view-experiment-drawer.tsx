/**
 * One experiment in a drawer over the Experiments list, in the shared frame:
 * the one-line title and the stats in the header, then the metric cards, the
 * parameter band and the surface arranged by the drawer's width, with the
 * actions in the footer.
 */
import { use } from "react";

import { Button, Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  ExperimentsActionsContext,
  type ExperimentRecord,
} from "../../../../../../react/experiments/context";
import { experimentProgressPercent } from "../../../shared/experiment-progress";
import { ComputeBackendBadge } from "../shared/compute-backend-badge";
import { DrawerFrame, FrameBand, FrameColumns } from "../shared/drawer-frame";
import { SweepNavigator } from "./sweep-navigator";
import { SweepSurface } from "./sweep-surface";
import { ExperimentMetrics } from "./view-experiment-drawer/experiment-metrics";
import { ExperimentStats } from "./view-experiment-drawer/experiment-stats";

// Keeps its footprint when a run can no longer be cancelled, so Remove and
// Close do not slide when a run finishes.
const cancelSlotStyle = css({
  display: "inline-flex",
  "&[data-hidden=true]": { visibility: "hidden" },
});

const PARAMETERS_HELP =
  "Only the selected combination computes. Move a control and compute follows it; results for visited combinations are kept.";

/** The frame's one-line title: `SIR transmission sweep · Seasonal Flu · 100 runs · dt 1`. */
export const describeExperiment = (
  experiment: Pick<
    ExperimentRecord,
    "name" | "scenarioName" | "runCount" | "dt"
  >,
): string =>
  `${experiment.name} · ${experiment.scenarioName ?? "Default scenario"} · ${experiment.runCount.toLocaleString("en-US")} runs · dt ${experiment.dt}`;

export const ViewExperimentDrawer = ({
  open,
  onClose,
  experiment,
}: {
  open: boolean;
  onClose: () => void;
  experiment: ExperimentRecord | undefined;
}) => {
  const { cancelExperiment, removeExperiment, setSweepSelection } = use(
    ExperimentsActionsContext,
  );

  if (!open || !experiment) {
    return null;
  }

  const canCancel =
    experiment.status === "initializing" || experiment.status === "running";
  const { sweep } = experiment;

  return (
    <DrawerFrame
      drawer={{ onClose, swapKey: "experiment" }}
      title={describeExperiment(experiment)}
      stats={<ExperimentStats experiment={experiment} />}
      badge={<ComputeBackendBadge backend={experiment} />}
      progress={experimentProgressPercent(experiment)}
      note={
        experiment.error === null
          ? null
          : { content: experiment.error, tone: "error" }
      }
      footer={
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
          <span
            className={cancelSlotStyle}
            data-hidden={!canCancel}
            aria-hidden={!canCancel}
          >
            <Button
              variant="subtle"
              tone="neutral"
              size="sm"
              prefix={<Icon name="stop" size="sm" />}
              disabled={!canCancel}
              onClick={() => cancelExperiment(experiment.id)}
            >
              Cancel
            </Button>
          </span>
          <Button variant="solid" tone="neutral" size="sm" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <FrameColumns
        primary={
          sweep ? (
            <>
              <FrameBand title="Parameters" help={PARAMETERS_HELP}>
                <SweepNavigator
                  axes={experiment.parameterAxes}
                  selection={sweep.selection}
                  status={{
                    computing: sweep.computing,
                    runsCompleted: sweep.runsCompleted,
                    runsSampled: sweep.runsSampled,
                    runTarget: sweep.runTarget,
                    runCount: experiment.runCount,
                  }}
                  onSelectionChange={(selection) =>
                    setSweepSelection(experiment.id, selection)
                  }
                />
              </FrameBand>
              {experiment.parameterAxes.length >= 2 ? (
                // Keyed so the axis and metric pickers never carry one
                // experiment's identifiers into another when the drawer swaps
                // records in place.
                <SweepSurface key={experiment.id} experiment={experiment} />
              ) : null}
            </>
          ) : undefined
        }
        secondary={
          experiment.metricSpecs.length > 0 ? (
            // Keyed so faded previous pictures and view choices never leak
            // from one experiment into another when the drawer swaps records
            // in place.
            <ExperimentMetrics key={experiment.id} experiment={experiment} />
          ) : undefined
        }
      />
    </DrawerFrame>
  );
};
