/**
 * The element uPlot draws a metric into. A component of its own so that the
 * timeline derives its view after its last hook, where the compiler caches
 * it: a render that keeps the frames then pushes nothing into uPlot.
 */
import { css } from "@hashintel/ds-helpers/css";

import { useMetricPlot } from "./use-metric-plot";

const chartStyle = css({
  width: "full",
  height: "full",
  minWidth: "[0]",
  _empty: {
    cursor: "default",
  },
  "& .u-over": {
    cursor: "crosshair",
    touchAction: "none",
  },
});

export const MetricPlot = ({
  chartRootRef,
  ...plot
}: Parameters<typeof useMetricPlot>[0]) => {
  useMetricPlot({ chartRootRef, ...plot });
  return <div ref={chartRootRef} className={chartStyle} />;
};
