import { use } from "react";

import { EditorContext } from "../../../react/state/editor-context";
import { CreateExperimentDrawer } from "./panels/SimulateView/experiments/create-experiment-drawer";
import { CreateMetricDrawer } from "./panels/SimulateView/metrics/create-metric-drawer";
import { CreateScenarioDrawer } from "./panels/SimulateView/scenarios/create-scenario-drawer";
import { SimulationPanelPresence } from "./panels/SimulateView/shared/simulation-panel";

/** Renders the one create drawer addressed by Petrinaut's app location. */
export const SimulationCreationDrawer = () => {
  const { setSimulateDrawer, simulateDrawer } = use(EditorContext);
  const closeDrawer = () => setSimulateDrawer({ type: "closed" });

  return (
    <>
      <SimulationPanelPresence>
        {simulateDrawer.type === "create-experiment" ? (
          <CreateExperimentDrawer open onClose={closeDrawer} />
        ) : simulateDrawer.type === "create-scenario" ? (
          <CreateScenarioDrawer open onClose={closeDrawer} />
        ) : null}
      </SimulationPanelPresence>
      {simulateDrawer.type === "create-metric" && (
        <CreateMetricDrawer open onClose={closeDrawer} />
      )}
    </>
  );
};
