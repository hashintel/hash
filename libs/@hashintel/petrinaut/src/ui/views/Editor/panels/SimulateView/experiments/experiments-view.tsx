/**
 * @layerRoot ui.views.editor.simulate.experiments
 * @role Lists the experiments of a session, and holds what the form that creates one and the results of one share
 *
 * The form and the results drawer both read the sweep's objective and its
 * optimizer from here (`sweep-optimizer.ts`, `shared/`).
 */
import { type ComponentProps, use } from "react";

import { Button, Chip, Icon } from "@hashintel/ds-components";

import {
  ExperimentsContext,
  type ExperimentRecord,
} from "../../../../../../react/experiments/context";
import { useEditorActions } from "../../../../../../react/state/editor-context";
import { Table, type TableColumn } from "../../../../../spreadsheet-kit/table";
import { SimulationPanel } from "../shared/simulation-panel";
import { SimulateSubviewFrame } from "../simulate-subview-frame";
import { ViewExperimentDrawer } from "./results/view-experiment-drawer";

const activePrefix = { variant: "naked", loading: true } as const;

/** How each status reads in the list: its word, its colour and its mark. */
const statusChips = {
  initializing: { label: "Initializing", color: "blue", prefix: activePrefix },
  running: { label: "Running", color: "blue", prefix: activePrefix },
  idle: { label: "Idle", color: "grey" },
  complete: { label: "Complete", color: "green" },
  error: {
    label: "Error",
    color: "red",
    prefix: { variant: "naked", iconName: "error" },
  },
  cancelled: { label: "Cancelled", color: "red" },
} satisfies Record<
  ExperimentRecord["status"],
  { label: string } & Pick<ComponentProps<typeof Chip>, "color" | "prefix">
>;

const ExperimentStatusBadge = ({
  status,
}: {
  status: ExperimentRecord["status"];
}) => {
  const { label, ...chip } = statusChips[status];

  return (
    <Chip variant="soft" {...chip}>
      {label}
    </Chip>
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

export const ExperimentsView = () => {
  const { setSimulateDrawer } = useEditorActions();
  const {
    experiments,
    selectedExperiment,
    selectedExperimentId,
    setSelectedExperimentId,
  } = use(ExperimentsContext);

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
          onClick={() => setSimulateDrawer({ type: "create-experiment" })}
        >
          Create
        </Button>
      }
    >
      <Table
        columns={experimentColumns}
        emptyLabel="No experiments yet"
        getRowId={(experiment) => experiment.id}
        rows={experiments}
        selectedRowId={selectedExperimentId}
        onRowSelect={(experiment) => setSelectedExperimentId(experiment.id)}
      />

      <ViewExperimentDrawer
        onClose={closeViewDrawer}
        experiment={selectedExperiment ?? undefined}
      />
      {selectedExperimentId !== null && selectedExperiment === null && (
        <SimulationPanel
          title="Experiment unavailable"
          onClose={closeViewDrawer}
        >
          <SimulationPanel.Header />
          <SimulationPanel.Body>
            This experiment is not available in this session. Close this view
            and create an experiment to run it again.
          </SimulationPanel.Body>
          <SimulationPanel.Footer
            actions={
              <Button size="sm" onClick={closeViewDrawer}>
                Close
              </Button>
            }
          />
        </SimulationPanel>
      )}
    </SimulateSubviewFrame>
  );
};
