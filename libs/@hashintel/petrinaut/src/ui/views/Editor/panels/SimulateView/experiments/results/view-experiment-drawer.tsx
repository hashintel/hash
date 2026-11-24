/**
 * @layerRoot ui.views.editor.simulate.experiments.results
 * @role The drawer that shows one experiment: its status, the sweep's surface and navigator, its metric cards and the study that drives it
 *
 * Other blocks import this file only. Inside, `experiment-results.tsx`
 * reads the record and builds a `ResultsModel` (`results-model.ts`),
 * `view-experiment-drawer/results-view.tsx` renders that model and reads no
 * record, and `drawer-frame.tsx` is the frame the view is laid out in.
 */
import { SimulationPanelPresence } from "../../shared/simulation-panel";
import { useExperimentResultsModel } from "./experiment-results";
import { ResultsView } from "./view-experiment-drawer/results-view";

import type { ExperimentRecord } from "../../../../../../../react/experiments/context";

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
