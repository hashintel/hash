import { use } from "react";

import { generatePetrinautId } from "@hashintel/petrinaut-core";

import { usePetrinautMutations } from "../../../../../../react";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { SimulationPanel } from "../shared/simulation-panel";
import {
  AdHocScenarioAuthoringBody,
  AdHocScenarioAuthoringFooter,
} from "./ad-hoc-scenario-authoring";
import { useAdHocScenarioAuthoring } from "./use-ad-hoc-scenario-authoring";

/**
 * The creation drawer's content: the expose-mode scenario form under Name
 * and Description. A child of the drawer so its hook and LSP session mount
 * only while the drawer is open.
 */
const CreateScenarioContent = ({ onClose }: { onClose: () => void }) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { addScenario } = usePetrinautMutations();
  const existingScenarioNames = new Set(
    (petriNetDefinition.scenarios ?? []).map((scenario) => scenario.name),
  );
  const authoring = useAdHocScenarioAuthoring({ existingScenarioNames });

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

interface CreateScenarioDrawerProps {
  open: boolean;
  onClose: () => void;
}

export const CreateScenarioDrawer = ({
  open,
  onClose,
}: CreateScenarioDrawerProps) => {
  if (!open) {
    return null;
  }
  return <CreateScenarioContent onClose={onClose} />;
};
