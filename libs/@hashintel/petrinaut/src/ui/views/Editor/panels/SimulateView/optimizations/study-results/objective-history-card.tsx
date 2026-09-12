/**
 * The study drawer's objective by step: the shared chart in a card titled
 * after the objective metric, the points built from the study's own trials.
 */
import { ChartCard, type ChartCardTone } from "../../shared/chart-card";
import { ObjectiveHistoryChart } from "../../shared/objective-history-chart";
import { buildObjectiveHistory } from "../../shared/objective-history-data";
import { objectiveMetricName } from "../../shared/study-labels";

import type { OptimizationRecord } from "../../../../../../../react/optimizations/context";

export const ObjectiveHistoryCard = ({
  optimization,
  plotHeight,
  tone,
}: {
  optimization: Pick<
    OptimizationRecord,
    "trials" | "input" | "best" | "completedTrials"
  >;
  plotHeight: number;
  /** How the card reads: `paused` while the study is paused. */
  tone?: ChartCardTone;
}) => (
  <ChartCard
    title="Objective by step"
    subtitle={`${objectiveMetricName(optimization.input)} per step · best so far as a line · ${optimization.completedTrials} completed`}
    help="Each dot is one step's objective value; the line is the best value found up to that step. Pruned and failed steps have no dot."
    bodyHeight={plotHeight}
    tone={tone}
  >
    <ObjectiveHistoryChart
      points={buildObjectiveHistory(
        optimization.trials,
        optimization.input.objective.direction,
      )}
      plotHeight={plotHeight}
    />
  </ChartCard>
);
