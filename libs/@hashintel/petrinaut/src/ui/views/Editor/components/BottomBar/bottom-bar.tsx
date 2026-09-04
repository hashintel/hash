import { use, useEffect, useRef } from "react";

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
import { useIsReadOnly } from "../../../../../react/state/use-is-read-only";
import { AiAssistantIcon } from "../../../../components/ai-assistant-icon";
import { BottomBarCollapseContext } from "./collapse-context";
import { CollapsibleGroup } from "./collapsible-group";
import { CursorModeDropdown } from "./cursor-mode-dropdown";
import { DiagnosticsIndicator } from "./diagnostics-indicator";
import { EditionTools } from "./edition-tools";
import { SimulationControls } from "./simulation-controls";
import { ToolbarButton } from "./toolbar-button";
import { ToolbarDivider } from "./toolbar-divider";
import { useBottomBarLayout } from "./use-bottom-bar-layout";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";

/** Gap between the bar and whatever is below it, canvas or bottom panel. */
const BOTTOM_BAR_GAP = 24;

const glassPanelStyle = css({
  padding: "1",
  backgroundColor: "white.a95",
  borderWidth: "thin",
  borderColor: "neutral.a50",
  boxShadow: "[0 3px 11px rgba(0, 0, 0, 0.1)]",
  // Named rather than `all`, which would animate the width a folding group
  // changes and take twice as long doing it as the group itself.
  transition: "[background-color 0.3s ease, box-shadow 0.3s ease]",
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

// Spans the canvas so the bar centres on the canvas rather than on the space
// between the panels, and lets clicks through everywhere the bar itself is not.
const bottomBarLaneStyle = css({
  position: "absolute",
  left: "[0]",
  right: "[0]",
  display: "flex",
  justifyContent: "center",
  pointerEvents: "none",
  zIndex: "[calc(var(--z-index-sticky) + 1)]",
});

const bottomBarStyle = css({
  display: "flex",
  gap: "[20px]",
  pointerEvents: "auto",
  // A bar wider than the lane overflows rather than squashing its segments:
  // revealing the hidden controls in a cramped window does exactly that.
  flexShrink: 0,
});

/**
 * Only a panel opening or closing animates the bar into place. Folding moves
 * it too, but there the offset follows the width the bar is measured at, frame
 * by frame, and a transition would race that with a curve of its own; a resize
 * drag wants none either, so the bar tracks the edge under the pointer.
 *
 * Both axes ride one transform, which the compositor animates like the panel's
 * own slide. A main-thread property could not stay with it: the frames dropped
 * while a panel's content mounts leave a layout-driven animation behind.
 *
 * Reduced motion is deliberately not honoured here. This transition is not
 * decoration, it is what keeps the bar attached to a panel that animates
 * regardless of the setting, and stopping only the bar detaches it.
 */
const barAnimatingStyle = cva({
  base: {},
  variants: {
    animating: {
      true: {
        transition: "[transform 150ms ease-in-out]",
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
  const isReadOnly = useIsReadOnly();

  const showDiagnostics = () => {
    setBottomPanelOpen(true);
    setActiveBottomPanelTab("diagnostics");
  };

  // Fallback to cursor mode when switching away from edit while in a mutative mode.
  useEffect(() => {
    if (mode !== "edit" && editionMode !== "cursor") {
      onEditionModeChange("cursor");
    }
  }, [mode, editionMode, onEditionModeChange]);

  // Setup keyboard shortcuts
  useKeyboardShortcuts(mode, onEditionModeChange, onCursorModeChange);

  const laneRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const layout = useBottomBarLayout(laneRef, barRef, {
    hasViewportControls: !isActualMode,
    isAnimating: isPanelAnimating,
  });

  // Edit tools are absent on a read-only net and outside edit mode, so the
  // group would otherwise fold an empty box and leave its gap behind.
  const hasEditionGroup = !isActualMode && (!isReadOnly || hasAiAssistant);

  return (
    <div
      ref={laneRef}
      className={bottomBarLaneStyle}
      style={{ bottom: BOTTOM_BAR_GAP }}
    >
      <div
        ref={barRef}
        data-bottom-bar
        data-holding={layout.isHolding}
        className={`${bottomBarStyle} ${barAnimatingStyle({ animating: isPanelAnimating })}`}
        style={{
          transform: `translate(${layout.offsetX}px, ${-layout.liftY}px)`,
        }}
        onPointerDown={layout.hold}
      >
        <BottomBarCollapseContext
          value={{
            isCollapsed: layout.isCollapsed,
            reportGroupWidth: layout.reportGroupWidth,
          }}
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
              <CursorModeDropdown
                editionMode={editionMode}
                onEditionModeChange={onEditionModeChange}
                cursorMode={cursorMode}
                onCursorModeChange={onCursorModeChange}
              />
              {hasEditionGroup && (
                <CollapsibleGroup>
                  <EditionTools
                    editionMode={editionMode}
                    onEditionModeChange={onEditionModeChange}
                  />
                  {hasAiAssistant && (
                    <>
                      <ToolbarDivider />
                      <ToolbarButton
                        tooltip={
                          isAiAssistantOpen
                            ? "Hide AI assistant"
                            : "Show AI assistant"
                        }
                        onClick={toggleAiAssistant}
                        isSelected={isAiAssistantOpen}
                        ariaLabel={
                          isAiAssistantOpen
                            ? "Hide AI assistant"
                            : "Show AI assistant"
                        }
                        ariaExpanded={isAiAssistantOpen}
                      >
                        <AiAssistantIcon size={18} />
                      </ToolbarButton>
                    </>
                  )}
                </CollapsibleGroup>
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
                onClick={() => setBottomPanelOpen(!isBottomPanelOpen)}
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
        </BottomBarCollapseContext>
      </div>
    </div>
  );
};
