import { css } from "@hashintel/ds-helpers/css";
import { refractive } from "@hashintel/refractive";
import { useEffect } from "react";

import { useEditorStore } from "../../../../state/editor-provider";
import type { EditorState } from "../../../../state/editor-store";
import { DiagnosticsIndicator } from "./diagnostics-indicator";
import { SimulationControls } from "./simulation-controls";
import { ToolbarModes } from "./toolbar-modes";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";

const refractiveContainerStyle = css({
  padding: "spacing.4",
  paddingX: "spacing.6",
  backgroundColor: "[rgba(255, 255, 255, 0.6)]",
  boxShadow: "[0 4px 16px rgba(0, 0, 0, 0.15)]",
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
  const isDiagnosticsPanelOpen = useEditorStore(
    (state) => state.isDiagnosticsPanelOpen,
  );
  const toggleDiagnosticsPanel = useEditorStore(
    (state) => state.toggleDiagnosticsPanel,
  );
  const diagnosticsPanelHeight = useEditorStore(
    (state) => state.diagnosticsPanelHeight,
  );

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

  // Calculate bottom offset based on diagnostics panel visibility
  const bottomOffset = isDiagnosticsPanelOpen
    ? diagnosticsPanelHeight + 12 + 24 // panel height + margin + spacing
    : 24;

  return (
    <div
      style={{
        position: "fixed",
        bottom: bottomOffset,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
      }}
    >
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
            onClick={toggleDiagnosticsPanel}
            isExpanded={isDiagnosticsPanelOpen}
          />
          <div className={dividerStyle} style={{ margin: "0 4px" }} />
          <ToolbarModes
            mode={mode}
            editionMode={editionMode}
            onEditionModeChange={onEditionModeChange}
          />

          {mode === "simulate" && <SimulationControls />}
        </div>
      </refractive.div>
    </div>
  );
};
