import { generatePetrinautId } from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../react";
import { SimulationPanel } from "../shared/simulation-panel";
import {
  AdHocScenarioAuthoringBody,
  AdHocScenarioAuthoringFooter,
} from "./ad-hoc-scenario-authoring";
import { useAdHocScenarioAuthoring } from "./use-ad-hoc-scenario-authoring";

/** The creation drawer: the expose-mode scenario form under Name and Description. */
export const CreateScenarioDrawer = ({ onClose }: { onClose: () => void }) => {
  const { addScenario } = usePetrinautMutations();
  const authoring = useAdHocScenarioAuthoring();

  const save = () => {
    const scenario = authoring.scenarioToSave(generatePetrinautId());
    if (scenario) {
      addScenario(scenario);
      onClose();
    }
  };

  return (
    <SimulationPanel
      title="Create a scenario"
      onClose={onClose}
      layer="creation"
    >
      <SimulationPanel.Header description="Initial configurations of tokens that can be quickly loaded in to 'Model' or 'Simulate' mode" />
      <AdHocScenarioAuthoringBody authoring={authoring} />
      <AdHocScenarioAuthoringFooter
        authoring={authoring}
        closeLabel="Cancel"
        saveLabel="Create"
        onClose={onClose}
        onSave={save}
      />
    </SimulationPanel>
  );
};
