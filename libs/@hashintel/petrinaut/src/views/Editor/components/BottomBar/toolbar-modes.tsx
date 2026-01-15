import { use } from "react";
import { FaArrowPointer, FaCircle, FaHand, FaSquare } from "react-icons/fa6";

import type { EditorState } from "../../../../state/editor-provider";
import { SimulationContext } from "../../../../state/simulation-provider";
import { ToolbarButton } from "./toolbar-button";

type EditorMode = EditorState["globalMode"];
type EditorEditionMode = EditorState["editionMode"];

interface ToolbarModesProps {
  mode: EditorMode;
  editionMode: EditorEditionMode;
  onEditionModeChange: (mode: EditorEditionMode) => void;
}

export const ToolbarModes: React.FC<ToolbarModesProps> = ({
  mode,
  editionMode,
  onEditionModeChange,
}) => {
  const { state: simulationState } = use(SimulationContext);
  const isSimulationRunning =
    simulationState === "Running" || simulationState === "Paused";

  // Show Place/Transition buttons only in edit mode and when simulation is not running
  const showMutativeButtons = mode === "edit" && !isSimulationRunning;

  return (
    <>
      {showMutativeButtons && (
        <>
          <ToolbarButton
            tooltip="Add Place (N)"
            onClick={() => onEditionModeChange("add-place")}
            isSelected={editionMode === "add-place"}
            ariaLabel="Add place mode"
            draggable
            onDragStart={(event) => {
              // eslint-disable-next-line no-param-reassign
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("application/reactflow", "place");
            }}
          >
            <FaCircle />
          </ToolbarButton>
          <ToolbarButton
            tooltip="Add Transition (T)"
            onClick={() => onEditionModeChange("add-transition")}
            isSelected={editionMode === "add-transition"}
            ariaLabel="Add transition mode"
            draggable
            onDragStart={(event) => {
              // eslint-disable-next-line no-param-reassign
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("application/reactflow", "transition");
            }}
          >
            <FaSquare />
          </ToolbarButton>
        </>
      )}
      <ToolbarButton
        tooltip="Select (V)"
        onClick={() => onEditionModeChange("select")}
        isSelected={editionMode === "select"}
        ariaLabel="Select mode"
      >
        <FaArrowPointer />
      </ToolbarButton>
      <ToolbarButton
        tooltip="Pan (H)"
        onClick={() => onEditionModeChange("pan")}
        isSelected={editionMode === "pan"}
        ariaLabel="Pan mode"
      >
        <FaHand />
      </ToolbarButton>
    </>
  );
};
