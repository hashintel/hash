/**
 * The metric timeline cards of a results surface, in one fixed grid with
 * whatever cards follow them. Every card is the same height whatever it
 * draws, so changing a chart's view moves nothing around it, and before any
 * frame has arrived the cards are stable shells per configured metric, so
 * the first data causes no layout shift. The one thing that resizes a card
 * is its Enlarge button: the card then spans the grid's full row at twice
 * the row height, and only the cards after it move.
 */
import { type ReactNode, useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  DEFAULT_METRIC_VIEW_SETTINGS,
  describeMetricView,
  ExperimentMetricTimeline,
  MetricViewMenu,
  type MetricViewSettings,
} from "../experiments/experiment-metric-timeline";
import {
  CHART_CARD_GRID_GAP,
  CHART_CARD_MIN_WIDTH,
  ChartCard,
  chartCardBodyHeight,
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

/** "large" spans the grid's full row and two of its rows; "default" is one cell. */
type MetricCardSize = "default" | "large";

const largeTileStyle = css({
  gridColumn: "[1 / -1]",
  gridRow: "[span 2]",
});

export const MetricTiles = ({
  tiles,
  timeDomain,
  contentEpoch,
  plotHeight,
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
  plotHeight: number;
  tone: ChartCardTone;
  /** Cards after the timelines, in the same grid. */
  children?: ReactNode;
}) => {
  const [settingsById, setSettingsById] = useState<
    Record<string, MetricViewSettings>
  >({});
  const [sizeById, setSizeById] = useState<Record<string, MetricCardSize>>({});
  const rowHeight = chartCardHeight({ bodyHeight: plotHeight });
  // Two rows and the gap between them, less the card's own chrome.
  const largePlotHeight = chartCardBodyHeight(
    2 * rowHeight + CHART_CARD_GRID_GAP,
  );

  return (
    <ChartCardGrid minColumnWidth={CHART_CARD_MIN_WIDTH} rowHeight={rowHeight}>
      {tiles.map((tile) => {
        const settings = settingsById[tile.id] ?? DEFAULT_METRIC_VIEW_SETTINGS;
        const view = describeMetricView(settings, tile.outputType);
        const large = (sizeById[tile.id] ?? "default") === "large";
        const tilePlotHeight = large ? largePlotHeight : plotHeight;
        const sizeLabel = large ? "Shrink" : "Enlarge";
        return (
          <ChartCard
            key={tile.id}
            title={tile.title}
            subtitle={
              tile.metricName === null ? view : `${tile.metricName} · ${view}`
            }
            actions={
              <>
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
                <Button
                  iconName={large ? "collapse" : "expand"}
                  variant="ghost"
                  size="xs"
                  aria-label={sizeLabel}
                  tooltip={sizeLabel}
                  onClick={() =>
                    setSizeById((previous) => ({
                      ...previous,
                      [tile.id]: large ? "default" : "large",
                    }))
                  }
                />
              </>
            }
            bodyHeight={tilePlotHeight}
            tone={tone}
            className={large ? largeTileStyle : undefined}
          >
            <ExperimentMetricTimeline
              frames={tile.frames}
              settings={settings}
              expectedOutputType={tile.outputType}
              timeDomain={timeDomain}
              contentEpoch={contentEpoch}
              plotHeight={tilePlotHeight}
            />
          </ChartCard>
        );
      })}
      {children}
    </ChartCardGrid>
  );
};
