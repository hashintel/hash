import { Menu } from "@ark-ui/react/menu";
import { Portal } from "@ark-ui/react/portal";
import { css, cva } from "@hashintel/ds-helpers/css";
import { FaChevronDown, FaRegHand } from "react-icons/fa6";
import { LuMousePointerClick } from "react-icons/lu";
import { TbCirclePlus2, TbSquarePlus2 } from "react-icons/tb";

import type { EditorState } from "../../../../state/editor-context";
import { usePortalContainerRef } from "../../../../state/portal-container-context";
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
    borderRadius: "[8px]",
    cursor: "pointer",
    transition: "[all 0.2s ease]",
    backgroundColor: "[transparent]",
    color: "neutral.s110",
    height: "8",
    paddingX: "[6px]",
    fontSize: "[20px]",
    _hover: {
      transform: "[scale(1.05)]",
      color: "neutral.s120",
    },
    _active: {
      transform: "[scale(0.95)]",
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

const cursorMenuContentStyle = css({
  background: "[white]",
  borderRadius: "[8px]",
  boxShadow:
    "[0px 0px 0px 1px rgba(0, 0, 0, 0.08), 0px 4px 12px rgba(0, 0, 0, 0.12)]",
  minWidth: "[150px]",
  zIndex: "[10001]",
  padding: "[4px]",
});

const cursorMenuItemStyle = cva({
  base: {
    display: "flex",
    alignItems: "center",
    gap: "[8px]",
    width: "[100%]",
    height: "[32px]",
    paddingX: "[8px]",
    borderRadius: "[6px]",
    fontSize: "[14px]",
    fontWeight: "medium",
    color: "neutral.s120",
    cursor: "pointer",
    _hover: {
      backgroundColor: "neutral.s10",
    },
  },
  variants: {
    selected: {
      true: {
        backgroundColor: "blue.s20",
        color: "[#3b82f6]",
        _hover: {
          backgroundColor: "blue.s20",
        },
      },
    },
  },
});

const shortcutStyle = css({
  marginLeft: "auto",
  fontSize: "[12px]",
  color: "neutral.s80",
  fontWeight: "normal",
});

const CursorModeDropdown: React.FC<{
  editionMode: EditorEditionMode;
  onEditionModeChange: (mode: EditorEditionMode) => void;
}> = ({ editionMode, onEditionModeChange }) => {
  const portalContainerRef = usePortalContainerRef();
  const isCursorMode = editionMode === "select" || editionMode === "pan";

  return (
    <Menu.Root
      positioning={{ placement: "top", gutter: 8 }}
      onSelect={({ value }) => {
        onEditionModeChange(value as EditorEditionMode);
      }}
    >
      <Menu.Trigger asChild>
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
      </Menu.Trigger>
      <Portal container={portalContainerRef}>
        <Menu.Positioner>
          <Menu.Content className={cursorMenuContentStyle}>
            <Menu.Item
              value="select"
              className={cursorMenuItemStyle({
                selected: editionMode === "select",
              })}
            >
              <LuMousePointerClick size={14} />
              <span>Select</span>
              <span className={shortcutStyle}>V</span>
            </Menu.Item>
            <Menu.Item
              value="pan"
              className={cursorMenuItemStyle({
                selected: editionMode === "pan",
              })}
            >
              <FaRegHand size={14} />
              <span>Pan</span>
              <span className={shortcutStyle}>H</span>
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
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
