/**
 * One study in a drawer over the Optimizations list: the study body stacked
 * for the overlay's width, with the actions in the footer. The full view
 * shows the same body spread over the section; "Open full view" switches.
 */
import { use } from "react";

import { Drawer } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { EditorContext } from "../../../../../../react/state/editor-context";
import { describeStudy, StudyActions, StudyBody } from "./study-view";

import type { OptimizationRecord } from "../../../../../../react/optimizations/context";

// The body is a column that never scrolls itself: the study body keeps its
// summary band still and scrolls the region beneath it.
const drawerBodyStyle = css({
  paddingTop: "[0]",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
});

export const ViewOptimizationDrawer = ({
  open,
  onClose,
  optimization,
}: {
  open: boolean;
  onClose: () => void;
  optimization: OptimizationRecord | undefined;
}) => {
  const { setSimulatePresentation } = use(EditorContext);

  if (!open || !optimization) {
    return null;
  }

  return (
    <Drawer
      size="xl"
      showBackdrop={false}
      onClose={onClose}
      swapKey="optimization"
    >
      <Drawer.Header
        title={`${optimization.input.name} · ${describeStudy(optimization)}`}
      />
      <Drawer.Body className={drawerBodyStyle}>
        <StudyBody optimization={optimization} layout="drawer" />
      </Drawer.Body>
      <Drawer.Footer
        actions={
          <StudyActions
            optimization={optimization}
            presentation="drawer"
            onPresentationChange={setSimulatePresentation}
            onClose={onClose}
          />
        }
      />
    </Drawer>
  );
};
