import { use, useCallback, useEffect } from "react";

import { Icon } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";
import { refractive } from "@hashintel/refractive";

import { LanguageClientContext } from "../../../../../react/lsp/context";
import { ActiveNetContext } from "../../../../../react/state/active-net-context";
import {
  type CursorMode,
  EditorContext,
  type EditorState,
} from "../../../../../react/state/editor-context";
import { AiAssistantIcon } from "../../../../components/ai-assistant-icon";
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
  zIndex: "[calc(var(--z-index-sticky) + 1)]",
  display: "flex",
  gap: "[20px]",
});

const animatingStyle = cva({
  base: {},
  variants: {
    animating: {
      true: {
        transition: "[bottom 150ms ease-in-out]",
      },
    },
  },
});

type EditorMode = EditorState["globalMode"];
type EditorEditionMode = EditorState["editionMode"];

interface BottomBarProps {
  mode: EditorMode;
  editionMode: EditorEditionMode;
  onEditionModeChange: (mode: EditorEditionMode) => void;
  cursorMode: CursorMode;
  onCursorModeChange: (mode: CursorMode) => void;
  hasAiAssistant: boolean;
}

export const BottomBar: React.FC<BottomBarProps> = ({
  mode,
  editionMode,
  hasAiAssistant,
  onEditionModeChange,
  cursorMode,
  onCursorModeChange,
}) => {
  const isActualMode = mode === "actual";
  const {
    isBottomPanelOpen,
    setBottomPanelOpen,
    setActiveBottomPanelTab,
    bottomPanelHeight,
    isAiAssistantOpen,
    isPanelAnimating,
    toggleAiAssistant,
  } = use(EditorContext);

  // Only error-severity diagnostics block simulation — warnings and hints
  // (e.g. HIR semantic lints) are informational.
  const { errorDiagnosticsCount } = use(LanguageClientContext);
  const hasDiagnostics = errorDiagnosticsCount > 0;
  const { activeSubnetId } = use(ActiveNetContext);
  const isInSubnet = activeSubnetId !== null;

  const showDiagnostics = useCallback(() => {
    setBottomPanelOpen(true);
    setActiveBottomPanelTab("diagnostics");
  }, [setBottomPanelOpen, setActiveBottomPanelTab]);

  const toggleBottomPanel = useCallback(() => {
    setBottomPanelOpen(!isBottomPanelOpen);
  }, [setBottomPanelOpen, isBottomPanelOpen]);

  // Fallback to cursor mode when switching away from edit while in a mutative mode.
  useEffect(() => {
    if (mode !== "edit" && editionMode !== "cursor") {
      onEditionModeChange("cursor");
    }
  }, [mode, editionMode, onEditionModeChange]);

  // Setup keyboard shortcuts
  useKeyboardShortcuts(mode, onEditionModeChange, onCursorModeChange);

  // Calculate bottom offset based on bottom panel visibility
  const bottomOffset = isBottomPanelOpen
    ? bottomPanelHeight + 24 // panel height + margin + spacing
    : 24;

  return (
    <div
      className={`${bottomBarPositionStyle} ${animatingStyle({ animating: isPanelAnimating })}`}
      style={{ bottom: bottomOffset }}
    >
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
            cursorMode={cursorMode}
            onCursorModeChange={onCursorModeChange}
            showEditTools={!isActualMode}
          />
          {hasAiAssistant && !isActualMode && (
            <>
              <ToolbarDivider />
              <ToolbarButton
                tooltip={
                  isAiAssistantOpen ? "Hide AI assistant" : "Show AI assistant"
                }
                onClick={toggleAiAssistant}
                isSelected={isAiAssistantOpen}
                ariaLabel={
                  isAiAssistantOpen ? "Hide AI assistant" : "Show AI assistant"
                }
                ariaExpanded={isAiAssistantOpen}
              >
                <AiAssistantIcon size={18} />
              </ToolbarButton>
            </>
          )}
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
              <Icon name="chevronDown" size="sm" />
            ) : (
              <Icon name="chevronUp" size="sm" />
            )}
          </ToolbarButton>
          {!isActualMode && (
            <>
              <DiagnosticsIndicator
                onClick={showDiagnostics}
                isExpanded={isBottomPanelOpen}
              />
              <ToolbarDivider />
              <SimulationControls
                disabled={hasDiagnostics}
                inSubnet={isInSubnet}
              />
            </>
          )}
        </div>
      </refractive.div>
    </div>
  );
};
