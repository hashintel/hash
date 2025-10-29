import { RefractivePane } from "@hashintel/ds-components/refractive-pane";
import { css } from "@hashintel/ds-helpers/css";
import { useEffect } from "react";

import type { EditorState } from "../../../../state/editor-store";
import { SimulationControls } from "./simulation-controls";
import { ToolbarModes } from "./toolbar-modes";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";

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

  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
      }}
    >
      <RefractivePane
        radius={12}
        blur={1.5}
        specularOpacity={0}
        scaleRatio={1}
        bezelWidth={20}
        glassThickness={120}
        refractiveIndex={1.5}
        className={css({
          padding: "spacing.4",
          paddingX: "spacing.6",
          borderRadius: "[12px]",
          backgroundColor: "[rgba(255, 255, 255, 0.8)]",
          boxShadow: "[0 4px 16px rgba(0, 0, 0, 0.15)]",
          display: "flex",
          alignItems: "center",
          gap: "spacing.4",
        })}
      >
        <ToolbarModes
          mode={mode}
          editionMode={editionMode}
          onEditionModeChange={onEditionModeChange}
        />
        {mode === "simulate" && <SimulationControls />}
      </RefractivePane>
    </div>
  );
};
