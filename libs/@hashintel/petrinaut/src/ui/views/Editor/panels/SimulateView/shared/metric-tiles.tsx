/**
 * A drawer's metric charts: one card per metric in a fixed grid. Every card
 * is the same height whatever it draws, so changing a chart's view moves
 * nothing around it, and before any frame has arrived the cards are stable
 * shells per configured metric, so the first data causes no layout shift.
 */
import { useState } from "react";

import {
  DEFAULT_METRIC_VIEW_SETTINGS,
  describeMetricView,
  ExperimentMetricTimeline,
  MetricViewMenu,
  type MetricViewSettings,
} from "../experiments/experiment-metric-timeline";
import {
  CHART_CARD_MIN_WIDTH,
  ChartCard,
  ChartCardGrid,
  chartCardHeight,
} from "./chart-card";

import type { MonteCarloUserDefinedMetricFrame } from "@hashintel/petrinaut-core";

export type MetricTile = {
  id: string;
  label: string;
  frames: readonly MonteCarloUserDefinedMetricFrame[];
  outputType: MonteCarloUserDefinedMetricFrame["outputType"];
};

/** The plot's height inside each card; the smallest the axes and labels fit in. */
export const METRIC_PLOT_HEIGHT = 220;
/** Every metric card's height, whatever it draws. */
export const METRIC_CARD_HEIGHT = chartCardHeight({
  bodyHeight: METRIC_PLOT_HEIGHT,
});

export const MetricTiles = ({
  tiles,
  timeDomain,
  contentEpoch,
}: {
  tiles: readonly MetricTile[];
  timeDomain: readonly [number, number];
  /**
   * Identity of what the frames represent (a selection key). A change fades
   * the previous picture out inside each plot instead of cutting to the
   * sparse new stream.
   */
  contentEpoch: string;
}) => {
  const [settingsById, setSettingsById] = useState<
    Record<string, MetricViewSettings>
  >({});

  return (
    <ChartCardGrid
      minColumnWidth={CHART_CARD_MIN_WIDTH}
      rowHeight={METRIC_CARD_HEIGHT}
    >
      {tiles.map((tile) => {
        const settings = settingsById[tile.id] ?? DEFAULT_METRIC_VIEW_SETTINGS;
        return (
          <ChartCard
            key={tile.id}
            title={tile.label}
            subtitle={describeMetricView(settings, tile.outputType)}
            actions={
              <MetricViewMenu
                outputType={tile.outputType}
                value={settings}
                onChange={(next) =>
                  setSettingsById((previous) => ({
                    ...previous,
                    [tile.id]: next,
                  }))
                }
              />
            }
            bodyHeight={METRIC_PLOT_HEIGHT}
          >
            <ExperimentMetricTimeline
              frames={tile.frames}
              settings={settings}
              expectedOutputType={tile.outputType}
              timeDomain={timeDomain}
              contentEpoch={contentEpoch}
              plotHeight={METRIC_PLOT_HEIGHT}
            />
          </ChartCard>
        );
      })}
    </ChartCardGrid>
  );
};
