import { css } from "@hashintel/ds-helpers/css";
import { refractive } from "@hashintel/refractive";
import { use, useCallback, useEffect } from "react";
import { FaChevronDown, FaChevronUp } from "react-icons/fa6";

import { LanguageClientContext } from "../../../../lsp/context";
import {
  EditorContext,
  type EditorState,
} from "../../../../state/editor-context";
import { DiagnosticsIndicator } from "./diagnostics-indicator";
import { SimulationControls } from "./simulation-controls";
import { ToolbarButton } from "./toolbar-button";
import { ToolbarDivider } from "./toolbar-divider";
import { ToolbarModes } from "./toolbar-modes";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";

const glassPanelStyle = css({
  padding: "1",
  backgroundColor: "white.a95",
  borderWidth: "thin",
  borderColor: "neutral.a50",
  boxShadow: "[0 3px 11px rgba(0, 0, 0, 0.1)]",
  transition: "[all 0.3s ease]",
  _hover: {
    backgroundColor: "white.a110",
    boxShadow: "[0 4px 13px rgba(0, 0, 0, 0.15)]",
  },
});

const toolbarContainerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
});

const bottomBarPositionStyle = css({
  position: "absolute",
  left: "[50%]",
  transform: "translateX(-50%)",
  zIndex: 1000,
  display: "flex",
  gap: "[20px]",
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
  const {
    isBottomPanelOpen,
    setBottomPanelOpen,
    setActiveBottomPanelTab,
    bottomPanelHeight,
  } = use(EditorContext);

  const { totalDiagnosticsCount } = use(LanguageClientContext);
  const hasDiagnostics = totalDiagnosticsCount > 0;

  const showDiagnostics = useCallback(() => {
    setBottomPanelOpen(true);
    setActiveBottomPanelTab("diagnostics");
  }, [setBottomPanelOpen, setActiveBottomPanelTab]);

  const toggleBottomPanel = useCallback(() => {
    setBottomPanelOpen(!isBottomPanelOpen);
  }, [setBottomPanelOpen, isBottomPanelOpen]);

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
    ? bottomPanelHeight + 24 // panel height + margin + spacing
    : 24;

  return (
    <div className={bottomBarPositionStyle} style={{ bottom: bottomOffset }}>
      {/* Edition tools segment */}
      <refractive.div
        className={glassPanelStyle}
        refraction={{
          radius: 8,
          blur: 3,
          bezelWidth: 20,
          glassThickness: 100,
        }}
      >
        <div className={toolbarContainerStyle}>
          <ToolbarModes
            editionMode={editionMode}
            onEditionModeChange={onEditionModeChange}
          />
        </div>
      </refractive.div>

      {/* Playback segment */}
      <refractive.div
        className={glassPanelStyle}
        refraction={{
          radius: 8,
          blur: 3,
          bezelWidth: 20,
          glassThickness: 100,
        }}
      >
        <div className={toolbarContainerStyle}>
          <ToolbarButton
            tooltip={isBottomPanelOpen ? "Hide Panel" : "Show Panel"}
            onClick={toggleBottomPanel}
            ariaLabel={isBottomPanelOpen ? "Hide panel" : "Show panel"}
            ariaExpanded={isBottomPanelOpen}
          >
            {isBottomPanelOpen ? (
              <FaChevronDown size={14} />
            ) : (
              <FaChevronUp size={14} />
            )}
          </ToolbarButton>
          <DiagnosticsIndicator
            onClick={showDiagnostics}
            isExpanded={isBottomPanelOpen}
          />
          <ToolbarDivider />
          <SimulationControls disabled={hasDiagnostics} />
        </div>
      </refractive.div>
    </div>
  );
};
