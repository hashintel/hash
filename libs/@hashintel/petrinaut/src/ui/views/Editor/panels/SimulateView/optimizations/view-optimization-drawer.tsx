/**
 * One study in a drawer over the Optimizations list: the study frame in a ds
 * Drawer. The full view shows the same frame over the section; "Open full
 * view" in the footer switches.
 */
import { StudyFrame } from "./study-view";

import type { OptimizationRecord } from "../../../../../../react/optimizations/context";

export const ViewOptimizationDrawer = ({
  open,
  onClose,
  optimization,
}: {
  open: boolean;
  onClose: () => void;
  optimization: OptimizationRecord | undefined;
}) => {
  if (!open || !optimization) {
    return null;
  }

  return (
    <StudyFrame
      optimization={optimization}
      presentation="drawer"
      drawer={{ onClose, swapKey: "optimization" }}
      onClose={onClose}
    />
  );
};
