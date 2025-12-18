import { css } from "@hashintel/ds-helpers/css";
import { refractive } from "@hashintel/refractive";
import { useEffect } from "react";

import { useCheckerContext } from "../../../../state/checker-provider";
import { useEditorStore } from "../../../../state/editor-provider";
import type { EditorState } from "../../../../state/editor-store";
import { DiagnosticsIndicator } from "./diagnostics-indicator";
import { SimulationControls } from "./simulation-controls";
import { ToolbarModes } from "./toolbar-modes";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";

const refractiveContainerStyle = css({
  paddingX: "spacing.2",
  paddingY: "spacing.1",
  backgroundColor: "[rgba(255, 255, 255, 0.6)]",
  boxShadow: "[0 4px 13px rgba(0, 0, 0, 0.15)]",
});

const toolbarContainerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "spacing.4",
});

const dividerStyle = css({
  background: "core.gray.20",
  width: "[1px]",
  height: "[40px]",
  margin: "[0 4px]",
});

const bottomBarPositionStyle = css({
  position: "fixed",
  left: "[50%]",
  transform: "translateX(-50%)",
  zIndex: 1000,
});

type EditorMode = EditorState["globalMode"];
type EditorEditionMode = EditorState["editionMode"];

interface BottomBarProps {
  mode: EditorMode;
  editionMode: EditorEditionMode;
  onEditionModeChange: (mode: EditorEditionMode) => void;
}

export const BottomBar: React.FC<BottomBarProps> = ({
  mode,
  editionMode,
  onEditionModeChange,
}) => {
  const isBottomPanelOpen = useEditorStore((state) => state.isBottomPanelOpen);
  const toggleBottomPanel = useEditorStore((state) => state.toggleBottomPanel);
  const bottomPanelHeight = useEditorStore((state) => state.bottomPanelHeight);

  const { totalDiagnosticsCount } = useCheckerContext();
  const hasDiagnostics = totalDiagnosticsCount > 0;

  // Fallback to 'pan' mode when switching to simulate mode if mutative mode
  useEffect(() => {
    if (
      mode === "simulate" &&
      (editionMode === "add-place" || editionMode === "add-transition")
    ) {
      onEditionModeChange("pan");
    }
  }, [mode, editionMode, onEditionModeChange]);

  // Setup keyboard shortcuts
  useKeyboardShortcuts(mode, onEditionModeChange);

  // Calculate bottom offset based on bottom panel visibility
  const bottomOffset = isBottomPanelOpen
    ? bottomPanelHeight + 12 + 24 // panel height + margin + spacing
    : 24;

  return (
    <div className={bottomBarPositionStyle} style={{ bottom: bottomOffset }}>
      <refractive.div
        className={refractiveContainerStyle}
        refraction={{
          radius: 12,
          blur: 3,
          bezelWidth: 22,
          glassThickness: 100,
        }}
      >
        <div className={toolbarContainerStyle}>
          <DiagnosticsIndicator
            onClick={toggleBottomPanel}
            isExpanded={isBottomPanelOpen}
          />
          <div className={dividerStyle} />
          <ToolbarModes
            mode={mode}
            editionMode={editionMode}
            onEditionModeChange={onEditionModeChange}
          />
          <div className={dividerStyle} />
          <SimulationControls disabled={hasDiagnostics} />
        </div>
      </refractive.div>
    </div>
  );
};
