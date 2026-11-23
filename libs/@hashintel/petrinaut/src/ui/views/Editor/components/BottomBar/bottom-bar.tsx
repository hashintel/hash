import { use, useEffect, useRef, type ReactNode } from "react";

import { Icon } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { refractive } from "@hashintel/refractive";

import { useComposesOnly } from "../../../../../react/document/use-composes-only";
import { LanguageClientContext } from "../../../../../react/lsp/context";
import {
  useEditorActions,
  useEditorFields,
  useEditorMode,
} from "../../../../../react/state/editor-context";
import { useIsReadOnly } from "../../../../../react/state/use-is-read-only";
import { AiAssistantIcon } from "../../../../components/ai-assistant-icon";
import { BOTTOM_BAR_GAP } from "../../../../constants/ui";
import { BottomBarCollapseContext } from "./collapse-context";
import { CollapsibleGroup } from "./collapsible-group";
import { CursorModeDropdown } from "./cursor-mode-dropdown";
import { DiagnosticsIndicator } from "./diagnostics-indicator";
import { EditionTools } from "./edition-tools";
import { EventSimulationControls } from "./event-simulation-controls";
import { ToolbarButton } from "./toolbar-button";
import { ToolbarDivider } from "./toolbar-divider";
import { useBottomBarLayout } from "./use-bottom-bar-layout";
import { useKeyboardShortcuts } from "./use-keyboard-shortcuts";

const glassPanelStyle = css({
  padding: "1",
  backgroundColor: "white.a95",
  borderWidth: "thin",
  borderColor: "neutral.a50",
  borderRadius: "[8px]",
  backdropFilter: "[blur(3px)]",
  boxShadow: "[0 3px 11px rgba(0, 0, 0, 0.1)]",
  // Named rather than `all`, which would animate the width a folding group
  // changes and take twice as long doing it as the group itself.
  transition: "[background-color 0.3s ease, box-shadow 0.3s ease]",
  _hover: {
    backgroundColor: "white.a110",
    boxShadow: "[0 4px 13px rgba(0, 0, 0, 0.15)]",
  },
});

const glassRefraction = {
  radius: 8,
  blur: 3,
  bezelWidth: 20,
  glassThickness: 100,
};

const toolbarContainerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
});

const aiAssistantIconStyle = css({ transform: "[translateY(-1px)]" });

// Spans the main view so the bar centres on the viewport rather than on the space
// between the panels, and lets clicks through everywhere the bar itself is not.
const bottomBarLaneStyle = css({
  position: "absolute",
  left: "[0]",
  right: "[0]",
  display: "flex",
  justifyContent: "center",
  pointerEvents: "none",
  zIndex: "[calc(var(--z-index-sticky) + 1)]",
  "&:has(> [data-bottom-bar]:hover)": {
    zIndex: "[calc(var(--z-index-sticky) + 3)]",
  },
});

const bottomBarStyle = css({
  display: "flex",
  gap: "[20px]",
  pointerEvents: "auto",
  // A bar wider than the lane overflows rather than squashing its segments:
  // revealing the hidden controls in a cramped window does exactly that.
  flexShrink: 0,
});

/** One glass panel of the bar, with its controls in a row. */
const GlassSegment = ({ children }: { children: ReactNode }) => (
  <refractive.div className={glassPanelStyle} refraction={glassRefraction}>
    <div className={toolbarContainerStyle}>{children}</div>
  </refractive.div>
);

/**
 * The canvas shortcuts. A leaf, because they read the selection and the
 * document, which the bar does not.
 */
const CanvasShortcuts = () => {
  useKeyboardShortcuts();
  return null;
};

export const BottomBar = ({ hasAiAssistant }: { hasAiAssistant: boolean }) => {
  const { editionMode, isBottomPanelOpen, isAiAssistantOpen } = useEditorFields(
    "editionMode",
    "isBottomPanelOpen",
    "isAiAssistantOpen",
  );
  // As the view reads it: the effect below must see the mode of the commit
  // that shows the bar again, not the one before it.
  const { globalMode } = useEditorMode();
  const {
    setEditionMode,
    setBottomPanelOpen,
    setActiveBottomPanelTab,
    toggleAiAssistant,
  } = useEditorActions();
  const isActualMode = globalMode === "actual";

  // Only error-severity diagnostics block simulation — warnings and hints
  // (e.g. HIR semantic lints) are informational.
  const { errorDiagnosticsCount } = use(LanguageClientContext);
  const hasDiagnostics = errorDiagnosticsCount > 0;
  const isReadOnly = useIsReadOnly();
  const composesOnly = useComposesOnly();

  const showDiagnostics = () => {
    setBottomPanelOpen(true);
    setActiveBottomPanelTab("diagnostics");
  };

  // Actual mode adds nothing, so a tool armed in Edit falls back to the
  // cursor. Simulate mode hides the bar, and the tool stays armed.
  useEffect(() => {
    if (globalMode !== "edit" && editionMode !== "cursor") {
      setEditionMode("cursor");
    }
  }, [globalMode, editionMode, setEditionMode]);

  const laneRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const layout = useBottomBarLayout(laneRef, barRef, {
    hasViewportControls: !isActualMode,
  });

  // Edit tools are absent on a read-only net and outside edit mode, so the
  // group would otherwise fold an empty box and leave its gap behind.
  const hasEditionGroup = !isActualMode && (!isReadOnly || hasAiAssistant);
  const aiAssistantLabel = isAiAssistantOpen
    ? "Hide AI assistant"
    : "Show AI assistant";

  return (
    <div
      ref={laneRef}
      className={bottomBarLaneStyle}
      style={{ bottom: BOTTOM_BAR_GAP }}
    >
      <CanvasShortcuts />
      <div ref={barRef} data-bottom-bar className={bottomBarStyle}>
        <BottomBarCollapseContext value={layout}>
          <GlassSegment>
            <CursorModeDropdown />
            {hasEditionGroup && (
              <CollapsibleGroup>
                {/* Left out here and not by the tools themselves. Simulate
                    mode hides the bar, and the net is writable again once
                    the bar shows. The bar renders then; a reader of the
                    reason further down does not, for a change that came
                    while it was hidden. */}
                {isReadOnly ? null : <EditionTools />}
                {hasAiAssistant && (
                  <>
                    <ToolbarDivider />
                    <ToolbarButton
                      tooltip={aiAssistantLabel}
                      shortcut="mod+shift+k"
                      onClick={toggleAiAssistant}
                      isSelected={isAiAssistantOpen}
                      ariaLabel={aiAssistantLabel}
                      ariaExpanded={isAiAssistantOpen}
                    >
                      <AiAssistantIcon
                        size={22}
                        className={aiAssistantIconStyle}
                      />
                    </ToolbarButton>
                  </>
                )}
              </CollapsibleGroup>
            )}
          </GlassSegment>

          <GlassSegment>
            <ToolbarButton
              tooltip={isBottomPanelOpen ? "Hide Panel" : "Show Panel"}
              onClick={() => setBottomPanelOpen(!isBottomPanelOpen)}
              ariaLabel={isBottomPanelOpen ? "Hide panel" : "Show panel"}
              ariaExpanded={isBottomPanelOpen}
            >
              <Icon
                name={isBottomPanelOpen ? "chevronDown" : "chevronUp"}
                size="sm"
              />
            </ToolbarButton>
            {!isActualMode && (
              <>
                <DiagnosticsIndicator
                  onClick={showDiagnostics}
                  isExpanded={isBottomPanelOpen}
                />
                {/* An editor that only composes runs nothing. */}
                {composesOnly ? null : (
                  <>
                    <ToolbarDivider />
                    <EventSimulationControls disabled={hasDiagnostics} />
                  </>
                )}
              </>
            )}
          </GlassSegment>
        </BottomBarCollapseContext>
      </div>
    </div>
  );
};
