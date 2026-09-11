/**
 * One study in a drawer over the Optimizations list: the shared results view
 * over the study's model, in a ds Drawer. The full view shows the same view
 * over the section; "Open full view" in the footer switches.
 */
import { ResultsView } from "../shared/results-view";
import { useStudyResultsModel } from "./study-results";

import type { OptimizationRecord } from "../../../../../../react/optimizations/context";

const StudyDrawer = ({
  optimization,
  onClose,
}: {
  optimization: OptimizationRecord;
  onClose: () => void;
}) => {
  const model = useStudyResultsModel(optimization, {
    presentation: "drawer",
    onClose,
  });
  return (
    <ResultsView model={model} drawer={{ onClose, swapKey: "optimization" }} />
  );
};

export const ViewOptimizationDrawer = ({
  open,
  onClose,
  optimization,
}: {
  open: boolean;
  onClose: () => void;
  optimization: OptimizationRecord | undefined;
}) =>
  open && optimization ? (
    <StudyDrawer optimization={optimization} onClose={onClose} />
  ) : null;
