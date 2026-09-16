import { use, useState } from "react";

import { LanguageClientContext } from "../../../../../react/lsp/context";
import { SimulationContext } from "../../../../../react/simulation/context";
import { ActiveNetContext } from "../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../react/state/editor-context";
import { useReadOnlyReason } from "../../../../../react/state/use-read-only-reason";
import { AiAssistantToggle } from "./ai-assistant-toggle";
import { CollapsibleGroup } from "./collapsible-group";
import { CursorModeDropdown } from "./cursor-mode-dropdown";
import { DiagnosticsIndicator } from "./diagnostics-indicator";
import { EditionTools } from "./edition-tools";
import { type BarFace, FaceSwitch } from "./face-switch";
import { GlassSurface } from "./glass-surface";
import { PanelToggle } from "./panel-toggle";
import { SimulationControls } from "./simulation-controls";
import { toolbarContainerStyle } from "./split-bar";
import { ToolbarDivider } from "./toolbar-divider";

import type { BarContentProps } from "./bar-content";

/**
 * The single segment from the design file: the cursor control tinted for the
 * face on show, that face's controls, and an Edit / Simulate switch at the
 * end. The edit face holds the tools that add to the net; the simulate face
 * holds the run. Starting a run turns the bar to the simulate face by itself;
 * everything else is the switch.
 */
export const ModesBar: React.FC<BarContentProps> = ({
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
  const { state: simulationState } = use(SimulationContext);
  const readOnlyReason = useReadOnlyReason();

  const hasSimulation = simulationState !== "NotRun";
  const [chosenFace, setChosenFace] = useState<BarFace>(
    hasSimulation ? "simulate" : "edit",
  );
  // A run starting is the one event that turns the face over unasked: the
  // controls for it would otherwise be a click away while it plays.
  const [hadSimulation, setHadSimulation] = useState(hasSimulation);
  if (hasSimulation !== hadSimulation) {
    setHadSimulation(hasSimulation);
    if (hasSimulation) {
      setChosenFace("simulate");
    }
  }

  const showDiagnostics = () => {
    setBottomPanelOpen(true);
    setActiveBottomPanelTab("diagnostics");
  };

  // The edit face holds the tools that add to the net, so it exists only
  // while the net takes additions. A run holding it is the one refusal the
  // bar can undo, and the switch stays up with that face locked; a net that
  // is read-only for good gets no switch at all.
  const canEdit = !isActualMode && readOnlyReason === null;
  const editLockedByRun = readOnlyReason?.kind === "simulation-active";
  const showFaceSwitch = canEdit || editLockedByRun;
  const face: BarFace = canEdit ? chosenFace : "simulate";

  return (
    <GlassSurface>
      <div className={toolbarContainerStyle}>
        <CursorModeDropdown
          editionMode={editionMode}
          onEditionModeChange={onEditionModeChange}
          cursorMode={cursorMode}
          onCursorModeChange={onCursorModeChange}
          appearance="filled"
          tone={face === "edit" ? "brand" : "simulation"}
        />
        {hasAiAssistant && !isActualMode && (
          <>
            <ToolbarDivider />
            <AiAssistantToggle />
          </>
        )}
        {face === "edit" ? (
          <CollapsibleGroup>
            <EditionTools
              editionMode={editionMode}
              onEditionModeChange={onEditionModeChange}
            />
          </CollapsibleGroup>
        ) : null}
        {face === "simulate" && !isActualMode ? (
          <>
            <ToolbarDivider />
            <DiagnosticsIndicator
              onClick={showDiagnostics}
              isExpanded={isBottomPanelOpen}
            />
            <SimulationControls
              disabled={errorDiagnosticsCount > 0}
              inSubnet={activeSubnetId !== null}
              settingsTrigger="speed"
            />
          </>
        ) : null}
        <ToolbarDivider />
        <PanelToggle glyph="chart" />
        {showFaceSwitch && (
          <>
            <ToolbarDivider />
            <FaceSwitch
              face={face}
              canEdit={canEdit}
              onFaceChange={setChosenFace}
            />
          </>
        )}
      </div>
    </GlassSurface>
  );
};
