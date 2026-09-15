import { use } from "react";

import { css } from "@hashintel/ds-helpers/css";

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
import { ToolbarDivider } from "./toolbar-divider";

import type { BarContentProps } from "./bar-content";

export const toolbarContainerStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
});

/**
 * The bar as two glass segments: the edit tools on the left, the playback
 * controls on the right, with the canvas showing between them.
 */
export const SplitBar: React.FC<BarContentProps> = ({
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
  // Only error-severity diagnostics block simulation — warnings and hints
  // (e.g. HIR semantic lints) are informational.
  const { errorDiagnosticsCount } = use(LanguageClientContext);
  const { activeSubnetId } = use(ActiveNetContext);
  const isReadOnly = useIsReadOnly();

  const showDiagnostics = () => {
    setBottomPanelOpen(true);
    setActiveBottomPanelTab("diagnostics");
  };

  // Edit tools are absent on a read-only net and outside edit mode, so the
  // group would otherwise fold an empty box and leave its gap behind.
  const hasEditionGroup = !isActualMode && (!isReadOnly || hasAiAssistant);

  return (
    <>
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
              <EditionTools
                editionMode={editionMode}
                onEditionModeChange={onEditionModeChange}
              />
              {hasAiAssistant && (
                <>
                  <ToolbarDivider />
                  <AiAssistantToggle />
                </>
              )}
            </CollapsibleGroup>
          )}
        </div>
      </GlassSurface>

      <GlassSurface>
        <div className={toolbarContainerStyle}>
          <PanelToggle glyph="chevron" />
          {!isActualMode && (
            <>
              <DiagnosticsIndicator
                onClick={showDiagnostics}
                isExpanded={isBottomPanelOpen}
              />
              <ToolbarDivider />
              <SimulationControls
                disabled={errorDiagnosticsCount > 0}
                inSubnet={activeSubnetId !== null}
              />
            </>
          )}
        </div>
      </GlassSurface>
    </>
  );
};
