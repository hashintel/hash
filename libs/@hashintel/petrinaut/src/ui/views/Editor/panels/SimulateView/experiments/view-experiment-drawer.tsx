import { ResultsView } from "../shared/results-view";
import { SimulationPanelPresence } from "../shared/simulation-panel";
import { useExperimentResultsModel } from "./experiment-results";

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
  open,
  onClose,
  experiment,
  presentation = "panel",
}: {
  open: boolean;
  onClose: () => void;
  experiment: ExperimentRecord | undefined;
  presentation?: "panel" | "inline";
}) => (
  <SimulationPanelPresence>
    {open && experiment ? (
      <ExperimentDrawer
        experiment={experiment}
        onClose={onClose}
        presentation={presentation}
      />
    ) : null}
  </SimulationPanelPresence>
);
