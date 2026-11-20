import { use } from "react";

import { Button, Icon } from "@hashintel/ds-components";

import {
  useEditorActions,
  useEditorState,
} from "../../../../../../react/state/editor-context";
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

export const ScenariosView = () => {
  const drawer = useEditorState((editor) => editor.simulateDrawer);
  const { setSimulateDrawer: setDrawer } = useEditorActions();
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
      <Table
        columns={scenarioColumns}
        emptyLabel="No scenarios yet"
        getRowId={(scenario) => scenario.id}
        rows={scenarios}
        selectedRowId={
          drawer.type === "view-scenario" ? drawer.scenarioId : null
        }
        onRowSelect={(scenario) =>
          setDrawer({ type: "view-scenario", scenarioId: scenario.id })
        }
      />

      <ViewScenarioDrawer
        open={!!selectedScenario}
        onClose={closeDrawer}
        scenario={selectedScenario}
      />
    </SimulateSubviewFrame>
  );
};
