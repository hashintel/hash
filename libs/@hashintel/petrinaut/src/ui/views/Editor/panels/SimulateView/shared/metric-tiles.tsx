/**
 * The metric timeline cards of a results surface, in one fixed grid with
 * whatever cards follow them. Every card is the same height whatever it
 * draws, so changing a chart's view moves nothing around it, and before any
 * frame has arrived the cards are stable shells per configured metric, so
 * the first data causes no layout shift.
 */
import { type ReactNode, useState } from "react";

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
  type ChartCardTone,
} from "./chart-card";

import type { MonteCarloUserDefinedMetricFrame } from "@hashintel/petrinaut-core";

/** One metric timeline card. */
export type MetricTile = {
  id: string;
  /** The card's title: the metric's label, or what point the chart describes. */
  title: string;
  /**
   * The metric's name, put before the view description in the subtitle when
   * the title says something else; null when the title is the metric.
   */
  metricName: string | null;
  frames: readonly MonteCarloUserDefinedMetricFrame[];
  outputType: MonteCarloUserDefinedMetricFrame["outputType"];
};

/** The plot's height inside an experiment's metric cards; the smallest the axes and labels fit in. */
export const METRIC_PLOT_HEIGHT = 220;

export const MetricTiles = ({
  tiles,
  timeDomain,
  contentEpoch,
  plotHeight = METRIC_PLOT_HEIGHT,
  tone,
  children,
}: {
  tiles: readonly MetricTile[];
  timeDomain: readonly [number, number];
  /**
   * Identity of what the frames represent (a selection key). A change fades
   * the previous picture out inside each plot instead of cutting to the
   * sparse new stream.
   */
  contentEpoch: string;
  /** The plot's height inside every card; the grid's row height follows. */
  plotHeight?: number;
  tone?: ChartCardTone;
  /** Cards after the timelines, in the same grid. */
  children?: ReactNode;
}) => {
  const [settingsById, setSettingsById] = useState<
    Record<string, MetricViewSettings>
  >({});

  return (
    <ChartCardGrid
      minColumnWidth={CHART_CARD_MIN_WIDTH}
      rowHeight={chartCardHeight({ bodyHeight: plotHeight })}
    >
      {tiles.map((tile) => {
        const settings = settingsById[tile.id] ?? DEFAULT_METRIC_VIEW_SETTINGS;
        const view = describeMetricView(settings, tile.outputType);
        return (
          <ChartCard
            key={tile.id}
            title={tile.title}
            subtitle={
              tile.metricName === null ? view : `${tile.metricName} · ${view}`
            }
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
            bodyHeight={plotHeight}
            tone={tone}
          >
            <ExperimentMetricTimeline
              frames={tile.frames}
              settings={settings}
              expectedOutputType={tile.outputType}
              timeDomain={timeDomain}
              contentEpoch={contentEpoch}
              plotHeight={plotHeight}
            />
          </ChartCard>
        );
      })}
      {children}
    </ChartCardGrid>
  );
};
