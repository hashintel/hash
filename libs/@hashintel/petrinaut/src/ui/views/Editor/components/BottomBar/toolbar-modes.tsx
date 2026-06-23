import { use } from "react";

import { Icon, Menu, type MenuItem } from "@hashintel/ds-components";
import { css, cva } from "@hashintel/ds-helpers/css";

import { ActiveNetContext } from "../../../../../react/state/active-net-context";
import { EditorContext } from "../../../../../react/state/editor-context";
import { SDCPNContext } from "../../../../../react/state/sdcpn-context";
import { useIsReadOnly } from "../../../../../react/state/use-is-read-only";
import { UserSettingsContext } from "../../../../../react/state/user-settings-context";
import { ToolbarButton } from "./toolbar-button";
import { ToolbarDivider } from "./toolbar-divider";

import type {
  CursorMode,
  EditorState,
} from "../../../../../react/state/editor-context";

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
  cursorMode: CursorMode;
  onCursorModeChange: (mode: CursorMode) => void;
}> = ({ editionMode, onEditionModeChange, cursorMode, onCursorModeChange }) => {
  const handleCursorChange = (mode: CursorMode) => {
    onCursorModeChange(mode);
    onEditionModeChange("cursor");
  };

  const items: MenuItem[] = [
    {
      id: "select",
      icon: "cursor",
      text: "Select",
      suffix: "V",
      tone: cursorMode === "select" ? "brand" : "neutral",
      selected: cursorMode === "select",
      onClick: () => handleCursorChange("select"),
    },
    {
      id: "pan",
      icon: "hand",
      text: "Pan",
      suffix: "H",
      tone: cursorMode === "pan" ? "brand" : "neutral",
      selected: cursorMode === "pan",
      onClick: () => handleCursorChange("pan"),
    },
  ];

  return (
    <Menu
      trigger={
        <button
          type="button"
          className={cursorTriggerStyle({ isActive: editionMode === "cursor" })}
          aria-label="Cursor mode"
        >
          {cursorMode === "pan" ? <Icon name="hand" /> : <Icon name="cursor" />}
          <Icon name="chevronDown" size="xs" className={dropdownArrowStyle} />
        </button>
      }
      items={items}
      position="top"
    />
  );
};

const ComponentDropdown: React.FC<{
  editionMode: EditorEditionMode;
}> = ({ editionMode }) => {
  const {
    petriNetDefinition: { subnets },
  } = use(SDCPNContext);
  const { componentSubnetId, setAddComponentMode } = use(EditorContext);

  const items: MenuItem[] = (subnets ?? []).map((subnet) => ({
    id: subnet.id,
    icon: "cube",
    text: subnet.name,
    selected:
      editionMode === "add-component" && componentSubnetId === subnet.id,
    onClick: () => setAddComponentMode(subnet.id),
  }));

  if (items.length === 0) {
    items.push({
      id: "empty",
      text: "No subnets defined",
      disabled: true,
      onClick: () => {},
    });
  }

  const isActive =
    editionMode === "add-component" && componentSubnetId !== null;

  return (
    <Menu
      trigger={
        <button
          type="button"
          className={cursorTriggerStyle({ isActive })}
          aria-label="Add component"
        >
          <Icon name="cube" />
          <Icon name="chevronDown" size="xs" className={dropdownArrowStyle} />
        </button>
      }
      items={items}
      position="top"
    />
  );
};

interface ToolbarModesProps {
  editionMode: EditorEditionMode;
  onEditionModeChange: (mode: EditorEditionMode) => void;
  cursorMode: CursorMode;
  onCursorModeChange: (mode: CursorMode) => void;
  showEditTools?: boolean;
}

export const ToolbarModes: React.FC<ToolbarModesProps> = ({
  editionMode,
  onEditionModeChange,
  cursorMode,
  onCursorModeChange,
  showEditTools = true,
}) => {
  const isReadOnly = useIsReadOnly();
  const { activeSubnetId } = use(ActiveNetContext);
  const isRootNet = activeSubnetId === null;
  const { extensions } = use(SDCPNContext);
  const { enableNetComponents } = use(UserSettingsContext);

  return (
    <>
      <CursorModeDropdown
        editionMode={editionMode}
        onEditionModeChange={onEditionModeChange}
        cursorMode={cursorMode}
        onCursorModeChange={onCursorModeChange}
      />
      {showEditTools && !isReadOnly && (
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
            <Icon name="circlePlus" />
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
            <Icon name="squarePlus" />
          </ToolbarButton>
          {isRootNet && enableNetComponents && (
            <ComponentDropdown editionMode={editionMode} />
          )}
        </>
      )}
    </>
  );
};
