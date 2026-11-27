import { MetricIcon } from "../../../../../shared/entity-icons";
import { MetricMainContent } from "./subviews/main";

import type { SubView } from "../../../../../sub-view/types";

export const metricMainSubView: SubView = {
  id: "metric-main-content",
  fullWidthCodeEditor: true,
  title: "Metric",
  icon: MetricIcon,
  main: true,
  component: MetricMainContent,
};
