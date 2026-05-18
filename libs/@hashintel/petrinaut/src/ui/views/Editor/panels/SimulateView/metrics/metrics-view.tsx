import { Icon } from "@hashintel/ds-components";
import { use, useState } from "react";

import type { Metric } from "../../../../../../core/types/sdcpn";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { Button } from "../../../../../components/button";
import { Table, type TableColumn } from "../../../../../components/table";
import { SimulateSubviewFrame } from "../simulate-subview-frame";
import { CreateMetricDrawer } from "./create-metric-drawer";
import { ViewMetricDrawer } from "./view-metric-drawer";

const metricColumns = [
  {
    id: "name",
    header: "Name",
    minWidth: 240,
    flex: "1 1 240px",
    render: (metric) => metric.name,
  },
  {
    id: "description",
    header: "Description",
    flex: "1 1 320px",
    tone: "subtle",
    render: (metric) => metric.description ?? "",
  },
] satisfies readonly TableColumn<Metric>[];

type MetricDrawerState =
  | { type: "closed" }
  | { type: "view-metric"; metricId: string }
  | { type: "create-metric" };

const MetricList = ({
  metrics,
  selectedId,
  onSelect,
}: {
  metrics: Metric[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) => {
  return (
    <Table
      columns={metricColumns}
      emptyLabel="No metrics yet"
      getRowId={(metric) => metric.id}
      rows={metrics}
      selectedRowId={selectedId}
      onRowSelect={(metric) => onSelect(metric.id)}
    />
  );
};

export const MetricsView = () => {
  const [drawer, setDrawer] = useState<MetricDrawerState>({
    type: "closed",
  });
  const { petriNetDefinition } = use(SDCPNContext);
  const metrics = petriNetDefinition.metrics ?? [];

  const selectedMetric =
    drawer.type === "view-metric"
      ? metrics.find((metric) => metric.id === drawer.metricId)
      : undefined;

  const closeDrawer = () => setDrawer({ type: "closed" });

  return (
    <SimulateSubviewFrame
      title="Metrics"
      action={
        <Button
          variant="solid"
          tone="neutral"
          size="sm"
          prefix={<Icon name="plus" size="sm" />}
          onClick={() => setDrawer({ type: "create-metric" })}
        >
          Create
        </Button>
      }
    >
      <MetricList
        metrics={metrics}
        selectedId={drawer.type === "view-metric" ? drawer.metricId : null}
        onSelect={(id) => setDrawer({ type: "view-metric", metricId: id })}
      />

      <CreateMetricDrawer
        open={drawer.type === "create-metric"}
        onClose={closeDrawer}
      />

      <ViewMetricDrawer
        open={!!selectedMetric}
        onClose={closeDrawer}
        metric={selectedMetric}
      />
    </SimulateSubviewFrame>
  );
};
