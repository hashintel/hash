/**
 * The objective's chart for a connected study: one distribution timeline fed
 * the selection stream — the step being evaluated while following, the
 * navigated point's refinement otherwise. A point that could not compute
 * shows the empty shell; the navigator's status line carries the reason.
 */
import { MetricTiles } from "../../shared/metric-tiles";

import type {
  OptimizationRecord,
  OptimizationSelectionStream,
} from "../../../../../../../react/optimizations/context";

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
    <MetricTiles
      tiles={[
        {
          id: metric.id,
          label: metric.name,
          frames:
            selection === null || selection.error !== null
              ? []
              : selection.metricFrames,
          outputType: "distribution",
        },
      ]}
      timeDomain={[0, input.execution.maxTime]}
      contentEpoch={selection?.key ?? ""}
      // The objective is the only chart, so it takes the whole width.
      defaultSize="large"
    />
  );
};
