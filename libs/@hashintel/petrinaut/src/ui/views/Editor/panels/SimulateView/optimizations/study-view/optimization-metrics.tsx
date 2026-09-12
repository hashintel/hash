/**
 * The objective's chart for a connected study: one distribution timeline fed
 * the selection stream — the step being evaluated while following, the
 * navigated point's refinement otherwise — in a card of fixed size beside the
 * surface. A point that could not compute shows the empty shell; the
 * navigator's status line carries the reason.
 */
import { useState } from "react";

import {
  DEFAULT_METRIC_VIEW_SETTINGS,
  describeMetricView,
  ExperimentMetricTimeline,
  MetricViewMenu,
} from "../../experiments/experiment-metric-timeline";
import {
  CHART_CARD_FOOTER_CHROME,
  ChartCard,
  type ChartCardTone,
} from "../../shared/chart-card";
import {
  SURFACE_FOOTER_HEIGHT,
  SURFACE_PLOT_HEIGHT,
} from "../../shared/surface-frame";

import type {
  OptimizationRecord,
  OptimizationSelectionStream,
} from "../../../../../../../react/optimizations/context";

/**
 * Sized so the card ends level with the surface card beside it: that card's
 * plot plus the footer row holding its axis selects, which this card has no
 * use for.
 */
export const OBJECTIVE_PLOT_HEIGHT =
  SURFACE_PLOT_HEIGHT + SURFACE_FOOTER_HEIGHT + CHART_CARD_FOOTER_CHROME;

export const OptimizationMetrics = ({
  optimization,
  selection,
  title,
  tone,
}: {
  optimization: OptimizationRecord;
  selection: OptimizationSelectionStream | null;
  /** The card's title: what point the chart describes. */
  title: string;
  /** How the card reads: `paused` while the study is paused. */
  tone?: ChartCardTone;
}) => {
  const [settings, setSettings] = useState(DEFAULT_METRIC_VIEW_SETTINGS);
  const input = optimization.input;
  const metric = input.model.definition.metrics?.find(
    (candidate) => candidate.id === input.objective.metricId,
  );
  if (!metric) {
    return null;
  }

  return (
    <ChartCard
      title={title}
      subtitle={`${metric.name} · ${describeMetricView(settings, "distribution")}`}
      actions={
        <MetricViewMenu
          outputType="distribution"
          value={settings}
          onChange={setSettings}
        />
      }
      bodyHeight={OBJECTIVE_PLOT_HEIGHT}
      tone={tone}
    >
      <ExperimentMetricTimeline
        frames={
          selection === null || selection.error !== null
            ? []
            : selection.metricFrames
        }
        settings={settings}
        expectedOutputType="distribution"
        timeDomain={[0, input.execution.maxTime]}
        contentEpoch={selection?.key ?? ""}
        plotHeight={OBJECTIVE_PLOT_HEIGHT}
      />
    </ChartCard>
  );
};
