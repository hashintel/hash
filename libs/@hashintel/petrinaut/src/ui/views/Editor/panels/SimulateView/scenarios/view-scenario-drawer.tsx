import { use } from "react";

import { css } from "@hashintel/ds-helpers/css";
import {
  adHocStateFromScenario,
  type Scenario,
} from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../react";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import {
  SimulationPanel,
  SimulationPanelPresence,
} from "../shared/simulation-panel";
import {
  AdHocScenarioAuthoringBody,
  AdHocScenarioAuthoringFooter,
} from "./ad-hoc-scenario-authoring";
import {
  scenarioFormContext,
  useAdHocScenarioAuthoring,
} from "./use-ad-hoc-scenario-authoring";

const migrationNoteStyle = css({
  fontSize: "xs",
  color: "neutral.s90",
  margin: "[0]",
});

const perPlaceMigrationNote =
  "Saving stores this scenario in the form's format.";

/**
 * Editing a saved scenario, whatever format stores it: the expose-mode form
 * seeded through `adHocStateFromScenario`. A scenario stored per place
 * opens converted and is rewritten in the form's format only when the user
 * saves; a scenario that defines its initial state as code keeps that code
 * verbatim and edits its name, description, Variables and Parameters here.
 * Remounts through `key` when the scenario changes.
 */
const ViewScenarioContent = ({
  scenario,
  onClose,
}: {
  scenario: Scenario;
  onClose: () => void;
}) => {
  const { extensions, petriNetDefinition } = use(SDCPNContext);
  const { updateScenario } = usePetrinautMutations();

  // The context the authoring hook synthesizes against, so an override the
  // form could not show (a parameter the net no longer has, or any
  // parameter while the extension is off) is dropped on open rather than
  // blocking Save.
  const source = adHocStateFromScenario(
    scenario,
    scenarioFormContext(extensions, petriNetDefinition),
  );
  const authoring = useAdHocScenarioAuthoring({
    initial: {
      name: scenario.name,
      description: scenario.description ?? "",
      state: source.state,
    },
    scenarioId: scenario.id,
    ...(source.kind === "code"
      ? {
          code: {
            body: source.code,
            parameters: scenario.scenarioParameters,
          },
        }
      : {}),
  });

  const save = () => {
    const updated = authoring.scenarioToSave(scenario.id);
    if (!updated) {
      return;
    }
    updateScenario({
      scenarioId: scenario.id,
      update: {
        name: updated.name,
        description: updated.description,
        scenarioParameters: updated.scenarioParameters,
        parameterOverrides: updated.parameterOverrides,
        initialState: updated.initialState,
      },
    });
    onClose();
  };

  return (
    <>
      <AdHocScenarioAuthoringBody authoring={authoring}>
        {source.kind === "per_place" ? (
          <p className={migrationNoteStyle}>{perPlaceMigrationNote}</p>
        ) : null}
      </AdHocScenarioAuthoringBody>
      <AdHocScenarioAuthoringFooter
        authoring={authoring}
        closeLabel="Close"
        saveLabel="Save"
        onClose={onClose}
        onSave={save}
      />
    </>
  );
};

interface ViewScenarioDrawerProps {
  onClose: () => void;
  /** The scenario shown; the drawer is closed while there is none. */
  scenario: Scenario | undefined;
}

export const ViewScenarioDrawer = ({
  onClose,
  scenario,
}: ViewScenarioDrawerProps) => {
  return (
    <SimulationPanelPresence>
      {scenario ? (
        <SimulationPanel title={scenario.name} onClose={onClose}>
          <SimulationPanel.Header />
          <ViewScenarioContent
            key={scenario.id}
            scenario={scenario}
            onClose={onClose}
          />
        </SimulationPanel>
      ) : null}
    </SimulationPanelPresence>
  );
};
