import { cva } from "@hashintel/ds-helpers/css";
import { FaArrowPointer, FaCircle, FaHand, FaSquare } from "react-icons/fa6";

import { Tooltip } from "../../../../components/tooltip";
import type { EditorState } from "../../../../state/editor-store";

type EditorMode = EditorState["globalMode"];
type EditorEditionMode = EditorState["editionMode"];

const iconContainerStyle = cva({
  base: {
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "[45px]",
    height: "[45px]",
    fontSize: "[22px]",
    transition: "[all 0.2s ease]",
    _hover: {
      transform: "[scale(1.1)]",
    },
  },
  variants: {
    selected: {
      true: {
        color: "[#3b82f6]",
      },
      false: {
        color: "core.gray.70",
      },
    },
  },
  compoundVariants: [
    {
      selected: true,
      css: {
        _hover: {
          color: "[#2563eb]",
        },
      },
    },
    {
      selected: false,
      css: {
        _hover: {
          color: "core.gray.90",
        },
      },
    },
  ],
});

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
  return (
    <>
      {mode === "edit" && (
        <>
          <Tooltip content="Add Place (N)">
            <div
              className={iconContainerStyle({
                selected: editionMode === "add-place",
              })}
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
              className={iconContainerStyle({
                selected: editionMode === "add-transition",
              })}
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
                  "transition"
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
      )}
      <Tooltip content="Select (V)">
        <div
          className={iconContainerStyle({ selected: editionMode === "select" })}
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
          className={iconContainerStyle({ selected: editionMode === "pan" })}
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
