import { SegmentedControl } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  useEditorActions,
  useEditorState,
  type SimulateViewMode,
} from "../../../../../react/state/editor-context";
import { ExperimentsView } from "./experiments/experiments-view";
import { ScenariosView } from "./scenarios/scenarios-view";

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
