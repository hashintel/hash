import {
  LineChart,
  LineSeriesOption,
  ScatterChart,
  ScatterSeriesOption,
} from "echarts/charts";
import { GridComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { FunctionComponent, useEffect, useRef, useState } from "react";

export type SeriesOption = LineSeriesOption | ScatterSeriesOption;

// Combine an Option type with only required components and charts via ComposeOption
export type ECOption = echarts.ComposeOption<SeriesOption>;

// Register the required components
echarts.use([LineChart, ScatterChart, GridComponent, SVGRenderer]);

type GraphProps = {
  options: ECOption;
};

export const EChart: FunctionComponent<GraphProps> = ({ options }) => {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [chart, setChart] = useState<echarts.ECharts>();

  useEffect(() => {
    if (wrapperRef.current) {
      setChart(echarts.init(wrapperRef.current));
    }
  }, [wrapperRef]);

  useEffect(() => {
    if (chart) {
      chart.setOption(options, { notMerge: true });
    }
  }, [chart, options]);

  return <div style={{ width: "100%", height: 500 }} ref={wrapperRef} />;
};
