import { MetricDrawer } from "./metric-drawer";

import type { Metric } from "@hashintel/petrinaut-core";

export const ViewMetricDrawer = ({
  open,
  onClose,
  metric,
}: {
  open: boolean;
  onClose: () => void;
  metric: Metric | undefined;
}) =>
  open && metric ? (
    <MetricDrawer key={metric.id} metric={metric} onClose={onClose} />
  ) : null;
