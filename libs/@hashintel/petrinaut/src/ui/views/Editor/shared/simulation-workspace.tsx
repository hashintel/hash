import { useRef, useState, type CSSProperties, type ReactNode } from "react";

import { css } from "@hashintel/ds-helpers/css";

import { useElementSize } from "../../../../react/hooks/use-element-size";
import { usePetrinautNavigationState } from "../../../../react/navigation";
import { useComposesOnly } from "../../../../react/state/use-composes-only";
import { useUserSettings } from "../../../../react/state/user-settings-context";
import { ResizeHandle } from "../../../resize/resize-handle";
import { SimulationWorkspaceContext } from "./simulation-workspace-context";

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
  "[data-motion=true] > &": {
    transition: "[margin-right 180ms cubic-bezier(0.16, 1, 0.3, 1)]",
    "@media (prefers-reduced-motion: reduce)": {
      transition: "[none]",
    },
  },
  "[data-simulation-workspace]:has([data-resizing=true]) > &": {
    transition: "[none]",
  },
  position: "relative",
  display: "flex",
  flex: "[1]",
  minWidth: "[0]",
  minHeight: "[0]",
  overflow: "hidden",
  "&:has(> div > [data-bottom-bar]:hover)": {
    overflow: "visible",
  },
  ":has(> [data-simulation-panel-slot] > [data-simulation-panel]:not([hidden]):not([data-closing=true])) > &":
    {
      marginRight: "[var(--simulation-panel-width)]",
    },
});

const panelSlotStyle = css({
  position: "absolute",
  top: "[0]",
  right: "[0]",
  bottom: "[0]",
  display: "none",
  width: "[var(--simulation-panel-width)]",
  minWidth: "[0]",
  minHeight: "[0]",
  "[data-animate=true] > &": {
    transition: "[width 200ms ease]",
    "&:has([data-resizing=true])": {
      transition: "[none]",
    },
    "@media (prefers-reduced-motion: reduce)": {
      transition: "[none]",
    },
  },
  "&:has(> [data-simulation-panel]:not([hidden]))": {
    display: "grid",
  },
  "[data-fullscreen=true] > &": { width: "full" },
});

const resizeEdgeStyle = css({
  display: "none",
  position: "absolute",
  top: "[0]",
  bottom: "[0]",
  left: "[0]",
  width: "[0]",
  ":has(> [data-simulation-panel]:not([hidden])) > &": {
    display: "block",
  },
});

export const SimulationWorkspace = ({ children }: { children: ReactNode }) => {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const workspaceSize = useElementSize(workspaceRef);
  const [preferredWidth, setPreferredWidth] = useState<number | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
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
  const workspaceWidth = workspaceSize?.width ?? 0;
  const maxWidth = Math.max(
    0,
    workspaceWidth - Math.min(280, workspaceWidth * 0.4),
  );
  const minWidth = Math.min(440, maxWidth);
  const panelWidth = Math.max(
    minWidth,
    Math.min(maxWidth, preferredWidth ?? Math.min(960, workspaceWidth * 0.6)),
  );

  return (
    <SimulationWorkspaceContext value={container}>
      <div
        ref={workspaceRef}
        data-simulation-workspace
        data-fullscreen={fullscreen}
        data-motion={showAnimations}
        data-animate={showAnimations && presentation.animate}
        style={
          {
            "--simulation-panel-width":
              workspaceSize === null ? "min(60%, 960px)" : `${panelWidth}px`,
          } as CSSProperties
        }
        className={workspaceStyle}
      >
        <div inert={fullscreen} className={contentStyle}>
          {children}
        </div>
        <div
          ref={setContainer}
          data-simulation-panel-slot
          className={panelSlotStyle}
        >
          {!fullscreen && (
            <div className={resizeEdgeStyle}>
              <ResizeHandle
                edge="left"
                label="Resize simulation panel"
                getSize={() => panelWidth}
                onResize={setPreferredWidth}
                minSize={minWidth}
                maxSize={maxWidth}
              />
            </div>
          )}
        </div>
      </div>
    </SimulationWorkspaceContext>
  );
};
