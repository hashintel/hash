/**
 * The objective's chart for a connected study: one distribution timeline fed
 * the selection stream — the step being evaluated while following, the
 * navigated point's refinement otherwise — in a slot of fixed size beside the
 * surface, so it has no size toggle. A point that could not compute shows the
 * empty shell; the navigator's status line carries the reason.
 */
import { css } from "@hashintel/ds-helpers/css";

import { ExperimentMetricTimeline } from "../../experiments/experiment-metric-timeline";

import type {
  OptimizationRecord,
  OptimizationSelectionStream,
} from "../../../../../../../react/optimizations/context";

const paneStyle = css({
  display: "flex",
  flexDirection: "column",
  minWidth: "[0]",
});

/** Sized so the pane ends level with the surface beside it. */
const PLOT_HEIGHT = 240;

export const OptimizationMetrics = ({
  optimization,
  selection,
}: {
  optimization: OptimizationRecord;
  selection: OptimizationSelectionStream | null;
}) => {
  const input = optimization.input;
  const metric = input.model.definition.metrics?.find(
    (candidate) => candidate.id === input.objective.metricId,
  );
  if (!metric) {
    return null;
  }

  return (
    <div className={paneStyle}>
      <ExperimentMetricTimeline
        frames={
          selection === null || selection.error !== null
            ? []
            : selection.metricFrames
        }
        label={metric.name}
        expectedOutputType="distribution"
        timeDomain={[0, input.execution.maxTime]}
        contentEpoch={selection?.key ?? ""}
        displaySize="large"
        plotHeight={PLOT_HEIGHT}
      />
    </div>
  );
};
