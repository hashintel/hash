import { ResultsView } from "../shared/results-view";
import { useExperimentResultsModel } from "./experiment-results";

import type { ExperimentRecord } from "../../../../../../react/experiments/context";

const ExperimentDrawer = ({
  experiment,
  onClose,
  presentation,
}: {
  experiment: ExperimentRecord;
  onClose: () => void;
  presentation: "drawer" | "inline";
}) => {
  const model = useExperimentResultsModel(experiment, onClose);
  return (
    <ResultsView
      model={model}
      drawer={
        presentation === "drawer"
          ? { onClose, swapKey: "experiment" }
          : undefined
      }
    />
  );
};

export const ViewExperimentDrawer = ({
  open,
  onClose,
  experiment,
  presentation = "drawer",
}: {
  open: boolean;
  onClose: () => void;
  experiment: ExperimentRecord | undefined;
  presentation?: "drawer" | "inline";
}) =>
  open && experiment ? (
    <ExperimentDrawer
      experiment={experiment}
      onClose={onClose}
      presentation={presentation}
    />
  ) : null;
