/**
 * One experiment in a drawer over the Experiments list: the shared results
 * view over the experiment's model, in a ds Drawer.
 */
import { ResultsView } from "../shared/results-view";
import { useExperimentResultsModel } from "./experiment-results";

import type { ExperimentRecord } from "../../../../../../react/experiments/context";

const ExperimentDrawer = ({
  experiment,
  onClose,
}: {
  experiment: ExperimentRecord;
  onClose: () => void;
}) => {
  const model = useExperimentResultsModel(experiment, onClose);
  return (
    <ResultsView model={model} drawer={{ onClose, swapKey: "experiment" }} />
  );
};

export const ViewExperimentDrawer = ({
  open,
  onClose,
  experiment,
}: {
  open: boolean;
  onClose: () => void;
  experiment: ExperimentRecord | undefined;
}) =>
  open && experiment ? (
    <ExperimentDrawer experiment={experiment} onClose={onClose} />
  ) : null;
