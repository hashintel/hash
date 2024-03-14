import type { BoxProps } from "@mui/material";
import { Box } from "@mui/material";
import type {
  BarSeriesOption,
  GraphSeriesOption,
  LineSeriesOption,
  ScatterSeriesOption,
} from "echarts/charts";
import { BarChart, GraphChart, LineChart, ScatterChart } from "echarts/charts";
// eslint-disable-next-line no-restricted-imports
import type { TooltipComponentOption } from "echarts/components";
// eslint-disable-next-line no-restricted-imports
import { GridComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import type { FunctionComponent } from "react";
import { useEffect, useRef, useState } from "react";

export type Chart = echarts.ECharts;

export type SeriesOption =
  | LineSeriesOption
  | ScatterSeriesOption
  | BarSeriesOption
  | GraphSeriesOption;

// Combine an Option type with only required components and charts via ComposeOption
export type ECOption = echarts.ComposeOption<
  SeriesOption | TooltipComponentOption
>;

// Register the required components
echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  GraphChart,
  GridComponent,
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
      sx={[{ width: "100%", height: 500 }, ...(Array.isArray(sx) ? sx : [sx])]}
      ref={wrapperRef}
    />
  );
};
