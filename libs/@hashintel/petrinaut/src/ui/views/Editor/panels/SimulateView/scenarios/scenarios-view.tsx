import { use } from "react";

import { Button, Icon } from "@hashintel/ds-components";

import { EditorContext } from "../../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { Table, type TableColumn } from "../../../../../components/table";
import { SimulateSubviewFrame } from "../simulate-subview-frame";
import { ViewScenarioDrawer } from "./view-scenario-drawer";

import type { Scenario } from "@hashintel/petrinaut-core";

const scenarioColumns = [
  {
    id: "name",
    header: "Name",
    minWidth: 240,
    flex: "1 1 240px",
    render: (scenario) => scenario.name,
  },
  {
    id: "description",
    header: "Description",
    flex: "1 1 320px",
    tone: "subtle",
    render: (scenario) => scenario.description ?? "",
  },
] satisfies readonly TableColumn<Scenario>[];

const ScenarioList = ({
  scenarios,
  selectedId,
  onSelect,
}: {
  scenarios: Scenario[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) => {
  return (
    <Table
      columns={scenarioColumns}
      emptyLabel="No scenarios yet"
      getRowId={(scenario) => scenario.id}
      rows={scenarios}
      selectedRowId={selectedId}
      onRowSelect={(scenario) => onSelect(scenario.id)}
    />
  );
};

export const ScenariosView = () => {
  const { simulateDrawer: drawer, setSimulateDrawer: setDrawer } =
    use(EditorContext);
  const { petriNetDefinition } = use(SDCPNContext);
  const scenarios = petriNetDefinition.scenarios ?? [];

  const selectedScenario =
    drawer.type === "view-scenario"
      ? scenarios.find((scenario) => scenario.id === drawer.scenarioId)
      : undefined;

  const closeDrawer = () => setDrawer({ type: "closed" });

  return (
    <SimulateSubviewFrame
      title="Scenarios"
      action={
        <Button
          variant="solid"
          tone="neutral"
          size="sm"
          prefix={<Icon name="plus" size="sm" />}
          onClick={() => setDrawer({ type: "create-scenario" })}
        >
          Create
        </Button>
      }
    >
      <ScenarioList
        scenarios={scenarios}
        selectedId={drawer.type === "view-scenario" ? drawer.scenarioId : null}
        onSelect={(id) => setDrawer({ type: "view-scenario", scenarioId: id })}
      />

      <ViewScenarioDrawer
        open={!!selectedScenario}
        onClose={closeDrawer}
        scenario={selectedScenario}
      />
    </SimulateSubviewFrame>
  );
};
