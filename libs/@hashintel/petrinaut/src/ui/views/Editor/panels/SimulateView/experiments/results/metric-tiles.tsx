/**
 * The metric timeline cards of a results surface, in one fixed grid with
 * whatever cards follow them. Every card is the same height whatever it
 * draws, so changing a chart's view moves nothing around it, and before any
 * frame has arrived the cards are stable shells per configured metric, so
 * the first data causes no layout shift. The one thing that resizes a card
 * is its Enlarge button: the card then spans the grid's full row at twice
 * the row height, the cards after it fill the cells its row has left, and
 * the rest move below.
 */
import { type ReactNode, useState } from "react";

import { Button } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { ChartCard, ChartCardGrid, type ChartCardTone } from "./chart-card";
import {
  CHART_CARD_GRID_GAP,
  CHART_CARD_MIN_WIDTH,
  METRIC_PLOT_HEIGHT,
  chartCardBodyHeight,
  chartCardHeight,
} from "./chart-card-layout";
import { describeMetricView } from "./metric-timeline/describe-metric-view";
import { ExperimentMetricTimeline } from "./metric-timeline/experiment-metric-timeline";
import { MetricViewMenu } from "./metric-timeline/metric-view-menu";
import { DEFAULT_METRIC_VIEW_SETTINGS } from "./metric-timeline/view-state";

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

const largeTileStyle = css({
  gridColumn: "[1 / -1]",
  gridRow: "[span 2]",
});

/**
 * One card. It holds its own view choice and size, so changing either
 * renders this card alone. Large spans the grid's full row and two of its
 * rows.
 */
const MetricTileCard = ({
  tile,
  timeDomain,
  contentEpoch,
  largePlotHeight,
  tone,
}: {
  tile: MetricTile;
  timeDomain: readonly [number, number];
  contentEpoch: string;
  largePlotHeight: number;
  tone: ChartCardTone;
}) => {
  const [settings, setSettings] = useState(DEFAULT_METRIC_VIEW_SETTINGS);
  const [large, setLarge] = useState(false);
  const view = describeMetricView(settings, tile.outputType);
  const tilePlotHeight = large ? largePlotHeight : METRIC_PLOT_HEIGHT;
  const sizeLabel = large ? "Shrink" : "Enlarge";

  return (
    <ChartCard
      title={tile.title}
      subtitle={
        tile.metricName === null ? view : `${tile.metricName} · ${view}`
      }
      actions={
        <>
          <MetricViewMenu
            outputType={tile.outputType}
            value={settings}
            onChange={setSettings}
          />
          <Button
            iconName={large ? "collapse" : "expand"}
            variant="ghost"
            size="xs"
            aria-pressed={large}
            aria-label={sizeLabel}
            tooltip={sizeLabel}
            onClick={() => setLarge(!large)}
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
};

export const MetricTiles = ({
  tiles,
  timeDomain,
  contentEpoch,
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
  tone: ChartCardTone;
  /** Cards after the timelines, in the same grid. */
  children?: ReactNode;
}) => {
  const rowHeight = chartCardHeight({ bodyHeight: METRIC_PLOT_HEIGHT });
  // Two rows and the gap between them, less the card's own chrome.
  const largePlotHeight = chartCardBodyHeight(
    2 * rowHeight + CHART_CARD_GRID_GAP,
  );

  return (
    <ChartCardGrid minColumnWidth={CHART_CARD_MIN_WIDTH} rowHeight={rowHeight}>
      {tiles.map((tile) => (
        <MetricTileCard
          key={tile.id}
          tile={tile}
          timeDomain={timeDomain}
          contentEpoch={contentEpoch}
          largePlotHeight={largePlotHeight}
          tone={tone}
        />
      ))}
      {children}
    </ChartCardGrid>
  );
};
