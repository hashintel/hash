import { use } from "react";

import { Button, Icon } from "@hashintel/ds-components";

import { EditorContext } from "../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { Table, type TableColumn } from "../../../../../components/table";
import { SimulateSubviewFrame } from "../simulate-subview-frame";
import { ViewMetricDrawer } from "./view-metric-drawer";

import type { Metric } from "@hashintel/petrinaut-core";

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
  const { simulateDrawer: drawer, setSimulateDrawer: setDrawer } =
    use(EditorContext);
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

      <ViewMetricDrawer
        open={!!selectedMetric}
        onClose={closeDrawer}
        metric={selectedMetric}
      />
    </SimulateSubviewFrame>
  );
};
