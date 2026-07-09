import { use, useState } from "react";

import { Button, Icon } from "@hashintel/ds-components";

import {
  ExperimentsContext,
  type ExperimentRecord,
} from "../../../../../../react/experiments/context";
import {
  Table,
  type TableColumn,
  TableStatusBadge,
} from "../../../../../components/table";
import { SimulateSubviewFrame } from "../simulate-subview-frame";
import { CreateExperimentDrawer } from "./create-experiment-drawer";
import { ViewExperimentDrawer } from "./view-experiment-drawer";

function formatExperimentStatus(status: ExperimentRecord["status"]): string {
  switch (status) {
    case "initializing":
      return "Initializing";
    case "running":
      return "Running";
    case "complete":
      return "Complete";
    case "error":
      return "Error";
    case "cancelled":
      return "Cancelled";
  }
}

const ExperimentStatusBadge = ({
  status,
}: {
  status: ExperimentRecord["status"];
}) => {
  const label = formatExperimentStatus(status);
  const isActive = status === "initializing" || status === "running";

  return (
    <TableStatusBadge
      iconName={status === "error" ? "error" : undefined}
      loading={isActive}
      tone={isActive ? "active" : status === "error" ? "error" : "neutral"}
    >
      {label}
    </TableStatusBadge>
  );
};

const experimentColumns = [
  {
    id: "name",
    header: "Name",
    minWidth: 240,
    flex: "1 1 240px",
    render: (experiment) => experiment.name,
  },
  {
    id: "scenario",
    header: "Scenario",
    width: 156,
    render: (experiment) => experiment.scenarioName ?? "Default",
  },
  {
    id: "model",
    header: "Model",
    width: 156,
    render: () => "Current model",
  },
  {
    id: "runs",
    header: "Runs",
    width: 156,
    tone: "subtle",
    render: (experiment) => experiment.runCount,
  },
  {
    id: "status",
    header: "Status",
    width: 156,
    render: (experiment) => (
      <ExperimentStatusBadge status={experiment.status} />
    ),
  },
] satisfies readonly TableColumn<ExperimentRecord>[];

const ExperimentList = ({
  experiments,
  selectedId,
  onSelect,
}: {
  experiments: readonly ExperimentRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) => {
  return (
    <Table
      columns={experimentColumns}
      emptyLabel="No experiments yet"
      getRowId={(experiment) => experiment.id}
      rows={experiments}
      selectedRowId={selectedId}
      onRowSelect={(experiment) => onSelect(experiment.id)}
    />
  );
};

export const ExperimentsView = () => {
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);
  const {
    experiments,
    selectedExperiment,
    selectedExperimentId,
    setSelectedExperimentId,
  } = use(ExperimentsContext);

  const closeCreateDrawer = () => setIsCreateDrawerOpen(false);
  const closeViewDrawer = () => setSelectedExperimentId(null);

  return (
    <SimulateSubviewFrame
      title="Experiments"
      action={
        <Button
          variant="solid"
          tone="neutral"
          size="sm"
          prefix={<Icon name="plus" size="sm" />}
          onClick={() => setIsCreateDrawerOpen(true)}
        >
          Create
        </Button>
      }
    >
      <ExperimentList
        experiments={experiments}
        selectedId={selectedExperimentId}
        onSelect={setSelectedExperimentId}
      />

      <CreateExperimentDrawer
        open={isCreateDrawerOpen}
        onClose={closeCreateDrawer}
        onCreated={(experimentId) => {
          setIsCreateDrawerOpen(false);
          setSelectedExperimentId(experimentId);
        }}
      />

      <ViewExperimentDrawer
        open={selectedExperiment !== null}
        onClose={closeViewDrawer}
        experiment={selectedExperiment ?? undefined}
      />
    </SimulateSubviewFrame>
  );
};
