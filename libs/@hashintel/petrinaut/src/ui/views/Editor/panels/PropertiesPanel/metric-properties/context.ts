import { requiredContext } from "../../../../../shared/required-context";

import type { Metric } from "@hashintel/petrinaut-core";

export const [MetricPropertiesContext, useMetricPropertiesContext] =
  requiredContext<{
    metric: Metric;
    /** The names of the document's other metrics, which this one may not take. */
    otherMetricNames: ReadonlySet<string>;
  }>("MetricProperties");
