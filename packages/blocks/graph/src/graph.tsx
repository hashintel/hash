import * as React from "react";

import * as echarts from "echarts/core";
import {
  LineChart,
  LineSeriesOption,
  ScatterChart,
  ScatterSeriesOption,
} from "echarts/charts";
import { GridComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

export type SeriesOption = LineSeriesOption | ScatterSeriesOption;

// Combine an Option type with only required components and charts via ComposeOption
export type ECOption = echarts.ComposeOption<SeriesOption>;

export type SupportedSeriesType = "scatter" | "line";

// Register the required components
echarts.use([LineChart, ScatterChart, GridComponent, SVGRenderer]);

type GraphProps = {
  options: ECOption;
};

export const Graph: React.FC<GraphProps> = ({ options }) => {
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  const [chart, setChart] = React.useState<echarts.ECharts>();

  React.useEffect(() => {
    if (wrapperRef.current) {
      setChart(echarts.init(wrapperRef.current));
    }
  }, [wrapperRef]);

  React.useEffect(() => {
    if (chart) {
      chart.setOption(options);
    }
  }, [chart, options]);

  return <div style={{ width: "100%", height: 500 }} ref={wrapperRef} />;
};
