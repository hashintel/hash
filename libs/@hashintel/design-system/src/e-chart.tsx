import type { BoxProps } from "@mui/material";
import { Box } from "@mui/material";
import type {
  BarSeriesOption,
  GraphSeriesOption,
  HeatmapSeriesOption,
  LineSeriesOption,
  MapSeriesOption,
  PieSeriesOption,
  ScatterSeriesOption,
} from "echarts/charts";
import {
  BarChart,
  GraphChart,
  HeatmapChart,
  LineChart,
  MapChart,
  PieChart,
  ScatterChart,
} from "echarts/charts";
// eslint-disable-next-line no-restricted-imports
import type {
  GeoComponentOption,
  LegendComponentOption,
  TooltipComponentOption,
  VisualMapComponentOption,
} from "echarts/components";
// eslint-disable-next-line no-restricted-imports
import {
  GeoComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import type {
  GraphEdgeItemOption,
  GraphNodeItemOption,
} from "echarts/types/src/chart/graph/GraphSeries";
import type { FunctionComponent } from "react";
import { useEffect, useRef, useState } from "react";

export type Chart = echarts.ECharts;

export type GraphNode = GraphNodeItemOption;
export type GraphEdge = GraphEdgeItemOption;

export type SeriesOption =
  | LineSeriesOption
  | ScatterSeriesOption
  | BarSeriesOption
  | GraphSeriesOption
  | PieSeriesOption
  | HeatmapSeriesOption
  | MapSeriesOption;

export type ComponentOption =
  | TooltipComponentOption
  | LegendComponentOption
  | GeoComponentOption
  | VisualMapComponentOption;

// Combine an Option type with only required components and charts via ComposeOption
export type ECOption = echarts.ComposeOption<SeriesOption | ComponentOption>;

// Register the required components
echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  GraphChart,
  PieChart,
  HeatmapChart,
  MapChart,
  GridComponent,
  GeoComponent,
  LegendComponent,
  VisualMapComponent,
  SVGRenderer,
  TooltipComponent,
]);

type GraphProps = {
  options: ECOption;
  onChartInitialized?: (chart: Chart) => void;
  sx?: BoxProps["sx"];
};

export const EChart: FunctionComponent<GraphProps> = ({
  options,
  sx,
  onChartInitialized,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [chart, setChart] = useState<Chart>();

  useEffect(() => {
    if (wrapperRef.current) {
      setChart(echarts.init(wrapperRef.current));
    }
  }, [wrapperRef]);

  useEffect(() => {
    if (chart) {
      onChartInitialized?.(chart);
    }
  }, [chart, onChartInitialized]);

  useEffect(() => {
    if (chart) {
      chart.setOption(options, false);
    }
  }, [chart, options]);

  useEffect(() => {
    if (chart && wrapperRef.current) {
      const resizeObserver = new ResizeObserver(() => {
        chart.resize();
      });

      resizeObserver.observe(wrapperRef.current);

      return () => {
        resizeObserver.disconnect();
      };
    }
  }, [chart]);

  return (
    <Box
      sx={[
        { width: "100%", height: "100%" },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      ref={wrapperRef}
    />
  );
};
