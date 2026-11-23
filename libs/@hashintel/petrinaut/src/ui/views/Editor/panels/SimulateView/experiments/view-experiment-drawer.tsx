import { SimulationPanelPresence } from "../shared/simulation-panel";
import { useExperimentResultsModel } from "./experiment-results";
import { ResultsView } from "./view-experiment-drawer/results-view";

import type { ExperimentRecord } from "../../../../../../react/experiments/context";

const ExperimentDrawer = ({
  experiment,
  onClose,
  presentation,
}: {
  experiment: ExperimentRecord;
  onClose: () => void;
  presentation: "panel" | "inline";
}) => {
  const model = useExperimentResultsModel(experiment, onClose);
  return (
    <ResultsView
      model={model}
      panel={presentation === "panel" ? { onClose } : undefined}
    />
  );
};

export const ViewExperimentDrawer = ({
  onClose,
  experiment,
  presentation = "panel",
}: {
  onClose: () => void;
  experiment: ExperimentRecord | undefined;
  presentation?: "panel" | "inline";
}) => (
  <SimulationPanelPresence>
    {experiment ? (
      <ExperimentDrawer
        experiment={experiment}
        onClose={onClose}
        presentation={presentation}
      />
    ) : null}
  </SimulationPanelPresence>
);
