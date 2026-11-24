/**
 * @layerRoot ui.views.editor.simulate
 * @role Lists the scenarios and experiments of a net, with the drawers that create one and show its results
 *
 * The editor shell mounts this file for the lists and
 * `simulation-creation-drawer.tsx` for the one create drawer the editor
 * state names. Scenarios, metrics and experiments each have a folder and a
 * layer. `shared/` holds what they share: the drawer every block opens
 * (`simulation-panel.tsx`), the frame of a list, the error line of a
 * drawer footer and the styles of a drawer body that scrolls.
 */

import { SegmentedControl } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  useEditorActions,
  useEditorState,
} from "../../../../../react/state/editor-context";
import { ExperimentsView } from "./experiments/experiments-view";
import { ScenariosView } from "./scenarios/scenarios-view";

import type { SimulateViewMode } from "../../../../../react/navigation/navigation";
import type { SegmentedControlItem } from "@hashintel/ds-components";

const containerStyle = css({
  display: "flex",
  flexDirection: "row",
  width: "full",
  height: "full",
  backgroundColor: "neutral.s00",
});

const sidebarStyle = css({
  display: "flex",
  flexDirection: "column",
  gap: "[2px]",
  padding: "[12px]",
  backgroundColor: "neutral.s00",
  borderRightWidth: "[1px]",
  borderRightStyle: "solid",
  borderRightColor: "neutral.s40",
  flexShrink: 0,
});

/** The Metrics mode has no tab and no view of its own: it shows the experiments. */
const modeOptions: SegmentedControlItem<SimulateViewMode>[] = [
  {
    value: "experiments",
    iconName: "flask",
    tooltip: "Experiments",
    tooltipOptions: { position: "right" },
  },
  {
    value: "scenarios",
    iconName: "layer",
    tooltip: "Scenarios",
    tooltipOptions: { position: "right" },
  },
];

export const SimulateViewTabs = () => {
  const mode = useEditorState((editor) => editor.simulateViewMode);
  const { setSimulateViewMode } = useEditorActions();
  return (
    <nav aria-label="Simulation views" className={sidebarStyle}>
      <SegmentedControl
        value={mode === "metrics" ? "experiments" : mode}
        items={modeOptions}
        onChange={setSimulateViewMode}
        layout="vertical"
        size="sm"
      />
    </nav>
  );
};

export const SimulateView = () => {
  const mode = useEditorState((editor) => editor.simulateViewMode);
  return (
    <div className={containerStyle}>
      {mode === "scenarios" ? <ScenariosView /> : <ExperimentsView />}
    </div>
  );
};
