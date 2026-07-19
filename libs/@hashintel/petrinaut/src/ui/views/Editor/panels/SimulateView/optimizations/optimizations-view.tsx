import { use, useState } from "react";

import { Button, Icon } from "@hashintel/ds-components";

import {
  type OptimizationRecord,
  OptimizationsContext,
} from "../../../../../../react/optimizations/context";
import {
  Table,
  type TableColumn,
  TableStatusBadge,
} from "../../../../../components/table";
import { SimulateSubviewFrame } from "../simulate-subview-frame";
import { CreateOptimizationDrawer } from "./create-optimization-drawer";
import { ViewOptimizationDrawer } from "./view-optimization-drawer";

function formatStatus(status: OptimizationRecord["status"]): string {
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

const OptimizationStatusBadge = ({
  optimization,
}: {
  optimization: OptimizationRecord;
}) => {
  const isActive =
    optimization.status === "initializing" || optimization.status === "running";

  return (
    <TableStatusBadge
      iconName={optimization.status === "error" ? "error" : undefined}
      loading={isActive}
      tone={
        isActive
          ? "active"
          : optimization.status === "error"
            ? "error"
            : "neutral"
      }
    >
      {formatStatus(optimization.status)}
    </TableStatusBadge>
  );
};

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toPrecision(5);
}

const optimizationColumns = [
  {
    id: "name",
    header: "Name",
    minWidth: 220,
    flex: "1 1 220px",
    render: (optimization) => optimization.input.name,
  },
  {
    id: "scenario",
    header: "Scenario",
    width: 180,
    render: (optimization) => {
      const scenario = optimization.input.model.definition.scenarios?.find(
        (candidate) => candidate.id === optimization.input.scenario.id,
      );
      return scenario?.name ?? optimization.input.scenario.id;
    },
  },
  {
    id: "objective",
    header: "Objective",
    width: 200,
    render: (optimization) => {
      const metric = optimization.input.model.definition.metrics?.find(
        (candidate) => candidate.id === optimization.input.objective.metricId,
      );
      const direction =
        optimization.input.objective.direction === "maximize" ? "Max" : "Min";
      return `${direction} ${metric?.name ?? optimization.input.objective.metricId}`;
    },
  },
  {
    id: "trials",
    header: "Steps",
    width: 120,
    tone: "subtle",
    render: (optimization) =>
      `${optimization.completedTrials + optimization.prunedTrials + optimization.failedTrials}/${optimization.requestedTrials}`,
  },
  {
    id: "best",
    header: "Best",
    width: 120,
    render: (optimization) =>
      optimization.best ? formatNumber(optimization.best.objective) : "—",
  },
  {
    id: "status",
    header: "Status",
    width: 140,
    render: (optimization) => (
      <OptimizationStatusBadge optimization={optimization} />
    ),
  },
] satisfies readonly TableColumn<OptimizationRecord>[];

export const OptimizationsView = () => {
  const [isCreateDrawerOpen, setIsCreateDrawerOpen] = useState(false);
  const {
    optimizations,
    selectedOptimization,
    selectedOptimizationId,
    setSelectedOptimizationId,
  } = use(OptimizationsContext);

  return (
    <SimulateSubviewFrame
      title="Optimizations"
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
      <Table
        columns={optimizationColumns}
        emptyLabel="No optimizations yet"
        getRowId={(optimization) => optimization.id}
        rows={optimizations}
        selectedRowId={selectedOptimizationId}
        onRowSelect={(optimization) =>
          setSelectedOptimizationId(optimization.id)
        }
      />

      <CreateOptimizationDrawer
        open={isCreateDrawerOpen}
        onClose={() => setIsCreateDrawerOpen(false)}
        onCreated={(optimizationId) => {
          setIsCreateDrawerOpen(false);
          setSelectedOptimizationId(optimizationId);
        }}
      />

      <ViewOptimizationDrawer
        open={selectedOptimization !== null}
        optimization={selectedOptimization ?? undefined}
        onClose={() => setSelectedOptimizationId(null)}
      />
    </SimulateSubviewFrame>
  );
};
