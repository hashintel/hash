import { use } from "react";

import { EditorContext } from "../../../react/state/editor-context";
import { CreateExperimentDrawer } from "./panels/SimulateView/experiments/create-experiment-drawer";
import { CreateMetricDrawer } from "./panels/SimulateView/metrics/create-metric-drawer";
import { CreateScenarioDrawer } from "./panels/SimulateView/scenarios/create-scenario-drawer";

/** Renders the one create drawer addressed by Petrinaut's app location. */
export const SimulationCreationDrawer = () => {
  const { setSimulateDrawer, simulateDrawer } = use(EditorContext);
  const closeDrawer = () => setSimulateDrawer({ type: "closed" });

  switch (simulateDrawer.type) {
    case "create-experiment":
      return <CreateExperimentDrawer open onClose={closeDrawer} />;
    case "create-metric":
      return <CreateMetricDrawer open onClose={closeDrawer} />;
    case "create-scenario":
      return <CreateScenarioDrawer open onClose={closeDrawer} />;
    case "closed":
    case "create-optimization":
    case "view-experiment":
    case "view-metric":
    case "view-scenario":
      return null;
  }
};
