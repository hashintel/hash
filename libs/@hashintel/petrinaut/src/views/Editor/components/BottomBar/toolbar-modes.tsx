import { FaArrowPointer, FaCircle, FaHand, FaSquare } from "react-icons/fa6";

import type { EditorState } from "../../../../state/editor-context";
import { useIsReadOnly } from "../../../../state/use-is-read-only";
import { ToolbarButton } from "./toolbar-button";

type EditorEditionMode = EditorState["editionMode"];

interface ToolbarModesProps {
  editionMode: EditorEditionMode;
  onEditionModeChange: (mode: EditorEditionMode) => void;
}

export const ToolbarModes: React.FC<ToolbarModesProps> = ({
  editionMode,
  onEditionModeChange,
}) => {
  const isReadOnly = useIsReadOnly();

  return (
    <>
      {!isReadOnly && (
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
