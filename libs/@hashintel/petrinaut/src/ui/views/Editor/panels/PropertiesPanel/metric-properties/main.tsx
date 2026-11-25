import { VerticalSubViewsContainer } from "../../../../../sub-view/vertical-sub-views-container";
import { MetricPropertiesContext } from "./context";
import { metricMainSubView } from "./sub-views";

import type { SubView } from "../../../../../sub-view/types";
import type { Metric } from "@hashintel/petrinaut-core";

interface MetricPropertiesProps {
  metric: Metric;
  /** Every metric of the document, the shown one included. */
  metrics: readonly Metric[];
}

export const MetricProperties: React.FC<MetricPropertiesProps> = ({
  metric,
  metrics,
}) => {
  const subViews: SubView[] = [
    {
      ...metricMainSubView,
      title: `${metricMainSubView.title} ${metric.name}`,
    },
  ];
  const otherMetricNames = new Set(
    metrics
      .filter((candidate) => candidate.id !== metric.id)
      .map((candidate) => candidate.name),
  );

  return (
    <MetricPropertiesContext value={{ metric, otherMetricNames }}>
      <VerticalSubViewsContainer
        key={metric.id}
        name="metric-properties"
        subViews={subViews}
      />
    </MetricPropertiesContext>
  );
};
