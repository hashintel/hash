import { css } from "@hashintel/ds-helpers/css";
import { FaArrowPointer, FaCircle, FaHand, FaSquare } from "react-icons/fa6";

import { Tooltip } from "../../../../components/tooltip";
import type { EditorState } from "../../../../state/editor-store";

type EditorMode = EditorState["globalMode"];
type EditorEditionMode = EditorState["editionMode"];

interface ToolbarModesProps {
  mode: EditorMode;
  editionMode: EditorEditionMode;
  onEditionModeChange: (mode: EditorEditionMode) => void;
}

function getIconContainerStyle(
  editionMode: EditorEditionMode,
  itemMode: EditorEditionMode,
) {
  const isSelected = editionMode === itemMode;
  return css({
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "[50px]",
    height: "[50px]",
    fontSize: "[24px]",
    color: isSelected ? "[#3b82f6]" : "core.gray.70",
    transition: "[all 0.2s ease]",
    "&:hover": {
      color: isSelected ? "[#2563eb]" : "core.gray.90",
      transform: "[scale(1.1)]",
    },
  });
}

export const ToolbarModes: React.FC<ToolbarModesProps> = ({
  mode,
  editionMode,
  onEditionModeChange,
}) => {
  return (
    <>
      {mode === "edit" && (
        <>
          <Tooltip content="Add Place (N)">
            <div
              className={getIconContainerStyle(editionMode, "add-place")}
              onClick={() => onEditionModeChange("add-place")}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onEditionModeChange("add-place");
                }
              }}
              draggable
              onDragStart={(event) => {
                // eslint-disable-next-line no-param-reassign
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("application/reactflow", "place");
              }}
              role="button"
              tabIndex={0}
              aria-label="Add place mode"
            >
              <FaCircle />
            </div>
          </Tooltip>
          <Tooltip content="Add Transition (T)">
            <div
              className={getIconContainerStyle(editionMode, "add-transition")}
              onClick={() => onEditionModeChange("add-transition")}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onEditionModeChange("add-transition");
                }
              }}
              draggable
              onDragStart={(event) => {
                // eslint-disable-next-line no-param-reassign
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData(
                  "application/reactflow",
                  "transition",
                );
              }}
              role="button"
              tabIndex={0}
              aria-label="Add transition mode"
            >
              <FaSquare />
            </div>
          </Tooltip>
        </>
      )}{" "}
      <Tooltip content="Select (V)">
        <div
          className={getIconContainerStyle(editionMode, "select")}
          onClick={() => onEditionModeChange("select")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onEditionModeChange("select");
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Select mode"
        >
          <FaArrowPointer />
        </div>
      </Tooltip>
      <Tooltip content="Pan (H)">
        <div
          className={getIconContainerStyle(editionMode, "pan")}
          onClick={() => onEditionModeChange("pan")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onEditionModeChange("pan");
            }
          }}
          role="button"
          tabIndex={0}
          aria-label="Pan mode"
        >
          <FaHand />
        </div>
      </Tooltip>
    </>
  );
};
