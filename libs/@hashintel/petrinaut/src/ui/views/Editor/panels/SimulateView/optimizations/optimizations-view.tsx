/**
 * @layerRoot ui.views.editor.optimizations
 * @role The Optimizations tab: the create drawer, one study's body in a drawer or as the whole section, the study surface and the steps table over the optimizations provider
 */
import { use } from "react";

import {
  Button,
  Chip,
  type ChipColor,
  Icon,
  LoadingSpinner,
} from "@hashintel/ds-components";

import {
  finishedTrialCount,
  isOptimizationActive,
  type OptimizationRecord,
  OptimizationsContext,
} from "../../../../../../react/optimizations/context";
import { EditorContext } from "../../../../../../react/state/editor-context";
import { Table, type TableColumn } from "../../../../../components/table";
import { formatNumber } from "../shared/format-value";
import {
  directionWord,
  objectiveMetricName,
  scenarioName,
} from "../shared/study-labels";
import { SimulateSubviewFrame } from "../simulate-subview-frame";
import { OptimizationFullView } from "./optimization-full-view";
import {
  OPTIMIZATION_STATUS_DISPLAY,
  optimizationDisplayStatus,
} from "./optimization-status";
import { ViewOptimizationDrawer } from "./view-optimization-drawer";

import type { FrameStatusTone } from "../shared/drawer-frame";

const CHIP_COLOR: Record<FrameStatusTone, ChipColor> = {
  active: "blue",
  done: "green",
  error: "red",
  neutral: "grey",
};

const OptimizationStatusBadge = ({
  optimization,
}: {
  optimization: OptimizationRecord;
}) => {
  const status = optimizationDisplayStatus(optimization);
  const { label, tone } = OPTIMIZATION_STATUS_DISPLAY[status];

  return (
    <Chip
      variant="soft"
      color={CHIP_COLOR[tone]}
      prefix={
        isOptimizationActive(optimization)
          ? {
              variant: "naked",
              children: <LoadingSpinner size="xs" variant="bars" />,
            }
          : status === "paused"
            ? { variant: "naked", iconName: "pause" }
            : status === "error"
              ? { variant: "naked", iconName: "error" }
              : undefined
      }
    >
      {label}
    </Chip>
  );
};

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
    render: (optimization) => scenarioName(optimization.input),
  },
  {
    id: "objective",
    header: "Objective",
    width: 200,
    render: (optimization) =>
      `${directionWord(optimization.input.objective.direction)} ${objectiveMetricName(optimization.input)}`,
  },
  {
    id: "trials",
    header: "Steps",
    width: 120,
    tone: "subtle",
    render: (optimization) =>
      `${finishedTrialCount(optimization)}/${optimization.requestedTrials}`,
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
  const { setSimulateDrawer, simulatePresentation } = use(EditorContext);
  const {
    optimizations,
    selectedOptimization,
    selectedOptimizationId,
    setSelectedOptimizationId,
  } = use(OptimizationsContext);

  // The full presentation gives the section to the open record; with no
  // record open (a fresh load of a `present=full` URL) the list shows, and
  // the next row opened takes the whole section.
  if (simulatePresentation === "full" && selectedOptimization !== null) {
    return <OptimizationFullView optimization={selectedOptimization} />;
  }

  return (
    <SimulateSubviewFrame
      title="Optimizations"
      action={
        <Button
          variant="solid"
          tone="neutral"
          size="sm"
          prefix={<Icon name="plus" size="sm" />}
          onClick={() => setSimulateDrawer({ type: "create-optimization" })}
        >
          Create
        </Button>
      }
    >
      <Table
        columns={optimizationColumns}
        emptyLabel="No optimizations yet"
        getRowId={(optimization) => optimization.id}
        // A study driving a sweep lives in that experiment's drawer.
        rows={optimizations.filter(
          (optimization) => optimization.origin === null,
        )}
        selectedRowId={selectedOptimizationId}
        onRowSelect={(optimization) =>
          setSelectedOptimizationId(optimization.id)
        }
      />

      <ViewOptimizationDrawer
        open={selectedOptimization !== null}
        optimization={selectedOptimization ?? undefined}
        onClose={() => setSelectedOptimizationId(null)}
      />
    </SimulateSubviewFrame>
  );
};
