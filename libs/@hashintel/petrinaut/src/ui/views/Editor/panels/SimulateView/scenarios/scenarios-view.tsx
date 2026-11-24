/**
 * @layerRoot ui.views.editor.simulate.scenarios
 * @role Lists the saved scenarios of a net, with the drawers that create one and edit one
 *
 * Other blocks import this file for the list, `create-scenario-drawer.tsx`
 * and `view-scenario-drawer.tsx` for the drawers, and
 * `use-ad-hoc-scenario-authoring.ts` for the context a scenario form is read
 * against.
 */
import { Button, Icon } from "@hashintel/ds-components";

import { usePetrinautDefinitionSelector } from "../../../../../../react/document/use-document";
import {
  useEditorActions,
  useEditorState,
} from "../../../../../../react/state/editor-context";
import { Table, type TableColumn } from "../../../../../spreadsheet-kit/table";
import { SimulateSubviewFrame } from "../shared/simulate-subview-frame";
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
  const scenarios =
    usePetrinautDefinitionSelector((definition) => definition.scenarios) ?? [];

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

      <ViewScenarioDrawer onClose={closeDrawer} scenario={selectedScenario} />
    </SimulateSubviewFrame>
  );
};
