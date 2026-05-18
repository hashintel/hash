import { Icon } from "@hashintel/ds-components";
import { use, useState } from "react";

import type { Scenario } from "@hashintel/petrinaut-core/types/sdcpn";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { Button } from "../../../../../components/button";
import { Table, type TableColumn } from "../../../../../components/table";
import { SimulateSubviewFrame } from "../simulate-subview-frame";
import { CreateScenarioDrawer } from "./create-scenario-drawer";
import { ViewScenarioDrawer } from "./view-scenario-drawer";

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

type ScenarioDrawerState =
  | { type: "closed" }
  | { type: "view-scenario"; scenarioId: string }
  | { type: "create-scenario" };

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
  const [drawer, setDrawer] = useState<ScenarioDrawerState>({
    type: "closed",
  });
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

      <CreateScenarioDrawer
        open={drawer.type === "create-scenario"}
        onClose={closeDrawer}
      />

      <ViewScenarioDrawer
        open={!!selectedScenario}
        onClose={closeDrawer}
        scenario={selectedScenario}
      />
    </SimulateSubviewFrame>
  );
};
