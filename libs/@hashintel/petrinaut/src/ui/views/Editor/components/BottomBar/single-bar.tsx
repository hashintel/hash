import { use } from "react";

import { LanguageClientContext } from "../../../../../react/lsp/context";
import { ActiveNetContext } from "../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../react/state/editor-context";
import { useIsReadOnly } from "../../../../../react/state/use-is-read-only";
import { AiAssistantToggle } from "./ai-assistant-toggle";
import { CollapsibleGroup } from "./collapsible-group";
import { CursorModeDropdown } from "./cursor-mode-dropdown";
import { DiagnosticsIndicator } from "./diagnostics-indicator";
import { EditionTools } from "./edition-tools";
import { GlassSurface } from "./glass-surface";
import { PanelToggle } from "./panel-toggle";
import { SimulationControls } from "./simulation-controls";
import { toolbarContainerStyle } from "./split-bar";
import { ToolbarDivider } from "./toolbar-divider";

import type { BarContentProps } from "./bar-content";

/**
 * Every control in one glass segment, in the order the work happens: what
 * the cursor does, what it adds, then the run, with Play filled as the one
 * action the bar is for and the panel toggle at the far end.
 */
export const SingleBar: React.FC<BarContentProps> = ({
  mode,
  editionMode,
  onEditionModeChange,
  cursorMode,
  onCursorModeChange,
  hasAiAssistant,
}) => {
  const isActualMode = mode === "actual";
  const { isBottomPanelOpen, setBottomPanelOpen, setActiveBottomPanelTab } =
    use(EditorContext);
  const { errorDiagnosticsCount } = use(LanguageClientContext);
  const { activeSubnetId } = use(ActiveNetContext);
  const isReadOnly = useIsReadOnly();

  const showDiagnostics = () => {
    setBottomPanelOpen(true);
    setActiveBottomPanelTab("diagnostics");
  };

  const hasEditionGroup = !isActualMode && (!isReadOnly || hasAiAssistant);

  return (
    <GlassSurface>
      <div className={toolbarContainerStyle}>
        <CursorModeDropdown
          editionMode={editionMode}
          onEditionModeChange={onEditionModeChange}
          cursorMode={cursorMode}
          onCursorModeChange={onCursorModeChange}
        />
        {hasEditionGroup && (
          <CollapsibleGroup>
            {hasAiAssistant && (
              <>
                <ToolbarDivider />
                <AiAssistantToggle />
              </>
            )}
            <EditionTools
              editionMode={editionMode}
              onEditionModeChange={onEditionModeChange}
            />
          </CollapsibleGroup>
        )}
        <ToolbarDivider />
        {!isActualMode && (
          <>
            <DiagnosticsIndicator
              onClick={showDiagnostics}
              isExpanded={isBottomPanelOpen}
            />
            <SimulationControls
              disabled={errorDiagnosticsCount > 0}
              inSubnet={activeSubnetId !== null}
              playEmphasis="filled"
            />
            <ToolbarDivider />
          </>
        )}
        <PanelToggle glyph="chevron" />
      </div>
    </GlassSurface>
  );
};
