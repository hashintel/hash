import * as React from "react";

import * as echarts from "echarts/core";
import "echarts/lib/component/grid";
import { LineChart, LineSeriesOption } from "echarts/charts";
import { GridComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";

// Combine an Option type with only required components and charts via ComposeOption
type ECOption = echarts.ComposeOption<LineSeriesOption>;

// Register the required components
echarts.use([LineChart, GridComponent, SVGRenderer]);

type GraphProps = {};

export const Graph: React.FC<GraphProps> = ({}) => {
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  const [chart, setChart] = React.useState<echarts.ECharts>();
  const [echartOptions, setEchartOptions] = React.useState<ECOption>({
    xAxis: {
      type: "category",
      data: ["A", "B", "C"],
    },
    yAxis: {
      type: "value",
    },
    series: [
      {
        data: [120, 200, 150],
        type: "line",
      },
    ],
  });

  React.useEffect(() => {
    if (wrapperRef.current) {
      setChart(echarts.init(wrapperRef.current));
    }
  }, [wrapperRef.current]);

  React.useEffect(() => {
    if (chart) {
      chart.setOption(echartOptions);
    }
  }, [chart, echartOptions]);

  return <div style={{ width: "100%", height: 500 }} ref={wrapperRef} />;
};
