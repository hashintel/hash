import { motionValue } from "motion";
import { useLayoutEffect, useState, type ReactNode } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { usePetrinautNavigationState } from "../../../../react/navigation/navigation";
import { useComposesOnly } from "../../../../react/state/use-composes-only";
import { useUserSettings } from "../../../../react/state/user-settings-context";
import { bindStyle, styleRef } from "../../../lib/readings";
import { PanelResizer } from "../../../resize/panel-resizer";
import { SimulationWorkspaceContext } from "./simulation-workspace-context";
import { simulationPanelWidth } from "./simulation-workspace/panel-width";
import { useElementWidth } from "./simulation-workspace/use-element-width";
import { useHasOpenPanel } from "./simulation-workspace/use-has-open-panel";

const workspaceStyle = css({
  position: "relative",
  display: "flex",
  flex: "[1]",
  minWidth: "[0]",
  minHeight: "[0]",
  overflow: "hidden",
  "&:has([data-bottom-bar]:hover)": { overflow: "visible" },
});

const contentStyle = css({
  position: "relative",
  display: "flex",
  flex: "[1]",
  minWidth: "[0]",
  minHeight: "[0]",
  overflow: "hidden",
  "&:has(> div > [data-bottom-bar]:hover)": {
    overflow: "visible",
  },
});

// The room an open panel takes from the content: as wide as the sizer inside
// it, times the share of its one column. A transition changes the share and
// a drag the sizer, so neither is in the other's way.
const roomStyle = css({
  display: "grid",
  flex: "none",
  gridTemplateColumns: "[0fr]",
  "[data-panel-open=true] > &": { gridTemplateColumns: "[1fr]" },
  "[data-motion=true] > &": {
    transition: "[grid-template-columns 180ms cubic-bezier(0.16, 1, 0.3, 1)]",
    "@media (prefers-reduced-motion: reduce)": {
      transition: "[none]",
    },
  },
});

// Lets the column be narrower than the sizer.
const roomClipStyle = css({
  minWidth: "[0]",
  overflow: "hidden",
});

// Over the workspace, with the panels' container at its right edge, and out
// of the pointer's way everywhere but on a panel.
const panelLayerStyle = css({
  position: "absolute",
  inset: "[0]",
  display: "flex",
  justifyContent: "flex-end",
  pointerEvents: "none",
});

// In fullscreen the container takes the room left of it as a share that
// grows. A transition changes the share and a drag the width, as for the room.
const panelContainerStyle = css({
  position: "relative",
  display: "grid",
  flex: "none",
  minWidth: "[0]",
  minHeight: "[0]",
  "& > *": { pointerEvents: "auto" },
  "[data-fullscreen=true] > * > &": { flexGrow: "1" },
  "[data-animate=true] > * > &": {
    transition: "[flex-grow 200ms ease]",
    "@media (prefers-reduced-motion: reduce)": {
      transition: "[none]",
    },
  },
});

// Over the workspace and its panel, and out of the pointer's way everywhere
// but on the separator.
const resizerLayerStyle = css({
  position: "absolute",
  inset: "[0]",
  zIndex: "sticky",
  pointerEvents: "none",
});

export const SimulationWorkspace = ({ children }: { children: ReactNode }) => {
  const [workspace, setWorkspace] = useState<HTMLDivElement | null>(null);
  const [panelContainer, setPanelContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const workspaceWidth = useElementWidth(workspace);
  const hasOpenPanel = useHasOpenPanel(panelContainer);
  const [preferredWidth, setPreferredWidth] = useState<number | null>(null);
  // What the panel's elements follow. A drag sets it on every pointer move,
  // which renders nothing.
  const [width] = useState(() => motionValue(0));
  // Both read as primitives, so a selection renders no workspace.
  const isSimulationFullscreen = usePetrinautNavigationState(
    (state) =>
      state.mode === "simulate" && state.simulatePresentation === "fullscreen",
  );
  const location = usePetrinautNavigationState(
    (state) =>
      `${state.mode}/${state.simulateView}/${state.simulateResource?.type}/${state.simulateResource?.id}/${state.overlay?.type}`,
  );
  const showAnimations = useUserSettings((settings) => settings.showAnimations);
  const composesOnly = useComposesOnly();
  // An editor that only composes has no Simulate mode, whatever the
  // navigation it is handed says.
  const fullscreen = !composesOnly && isSimulationFullscreen;
  const [presentation, setPresentation] = useState({
    location,
    fullscreen,
    animate: false,
  });
  if (
    presentation.location !== location ||
    presentation.fullscreen !== fullscreen
  ) {
    setPresentation({
      location,
      fullscreen,
      animate: presentation.location === location,
    });
  }
  const {
    minWidth,
    maxWidth,
    width: panelWidth,
  } = simulationPanelWidth(workspaceWidth, preferredWidth);

  // Outside a drag, the panel has the width worked out above. A layout
  // effect, so the frame that shows a new workspace width or a new choice
  // shows the panel at its width.
  useLayoutEffect(() => {
    width.set(panelWidth);
  }, [width, panelWidth]);

  return (
    <SimulationWorkspaceContext value={panelContainer}>
      <div
        ref={setWorkspace}
        data-simulation-workspace
        data-fullscreen={fullscreen}
        data-motion={showAnimations}
        data-animate={showAnimations && presentation.animate}
        data-panel-open={hasOpenPanel}
        className={workspaceStyle}
      >
        <div inert={fullscreen} className={contentStyle}>
          {children}
        </div>
        <div data-simulation-panel-room className={roomStyle}>
          <div className={roomClipStyle}>
            <div ref={styleRef({ width })} />
          </div>
        </div>
        <div className={panelLayerStyle}>
          <div
            ref={(element) => {
              setPanelContainer(element);
              return element ? bindStyle(element, { width }) : undefined;
            }}
            data-simulation-panel-container
            className={panelContainerStyle}
          />
        </div>
        {hasOpenPanel && !fullscreen && (
          <PanelResizer
            edge="right"
            size={width}
            isInPlace
            minSize={minWidth}
            maxSize={maxWidth}
            label="Resize simulation panel"
            className={resizerLayerStyle}
            onCommit={(pixels) => {
              if (Math.abs(pixels - panelWidth) < 0.5) {
                // A press that moved nothing chose no width.
                width.set(panelWidth);
              } else {
                setPreferredWidth(pixels);
              }
            }}
          />
        )}
      </div>
    </SimulationWorkspaceContext>
  );
};
