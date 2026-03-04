import { css, cva } from "@hashintel/ds-helpers/css";
import { FaChevronDown, FaRegHand } from "react-icons/fa6";
import { LuMousePointerClick } from "react-icons/lu";
import { TbCirclePlus2, TbSquarePlus2 } from "react-icons/tb";

import { Menu, type MenuItem } from "../../../../components/menu";
import type { EditorState } from "../../../../state/editor-context";
import { useIsReadOnly } from "../../../../state/use-is-read-only";
import { ToolbarButton } from "./toolbar-button";
import { ToolbarDivider } from "./toolbar-divider";

type EditorEditionMode = EditorState["editionMode"];

const cursorTriggerStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "[2px]",
    border: "none",
    borderRadius: "lg",
    cursor: "pointer",
    transition: "[all 0.2s ease]",
    backgroundColor: "[transparent]",
    color: "neutral.s110",
    height: "8",
    paddingX: "[6px]",
    fontSize: "xl",
    "& > *": {
      transition: "[transform 0.2s ease]",
    },
    _hover: {
      color: "neutral.s120",
      "& > *": {
        transform: "[scale(1.05)]",
      },
    },
    _active: {
      "& > *": {
        transform: "[scale(0.95)]",
      },
    },
  },
  variants: {
    isActive: {
      true: {
        color: "[#3b82f6]",
        _hover: {
          color: "[#2563eb]",
        },
      },
    },
  },
});

const dropdownArrowStyle = css({
  opacity: "[0.5]",
});

const CursorModeDropdown: React.FC<{
  editionMode: EditorEditionMode;
  onEditionModeChange: (mode: EditorEditionMode) => void;
}> = ({ editionMode, onEditionModeChange }) => {
  const isCursorMode = editionMode === "select" || editionMode === "pan";

  const items: MenuItem[] = [
    {
      id: "select",
      icon: <LuMousePointerClick size={14} />,
      label: "Select",
      suffix: "V",
      selected: editionMode === "select",
      onClick: () => onEditionModeChange("select"),
    },
    {
      id: "pan",
      icon: <FaRegHand size={14} />,
      label: "Pan",
      suffix: "H",
      selected: editionMode === "pan",
      onClick: () => onEditionModeChange("pan"),
    },
  ];

  return (
    <Menu
      trigger={
        <button
          type="button"
          className={cursorTriggerStyle({ isActive: isCursorMode })}
          aria-label="Cursor mode"
        >
          {editionMode === "pan" ? (
            <FaRegHand size={16} />
          ) : (
            <LuMousePointerClick size={16} />
          )}
          <FaChevronDown size={7} className={dropdownArrowStyle} />
        </button>
      }
      items={items}
      placement="top"
      animated
    />
  );
};

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
      <CursorModeDropdown
        editionMode={editionMode}
        onEditionModeChange={onEditionModeChange}
      />
      {!isReadOnly && (
        <>
          <ToolbarDivider />
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
            <TbCirclePlus2 />
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
            <TbSquarePlus2 />
          </ToolbarButton>
        </>
      )}
    </>
  );
};
