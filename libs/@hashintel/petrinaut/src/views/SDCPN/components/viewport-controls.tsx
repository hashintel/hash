import { css } from "@hashintel/ds-helpers/css";
import { use } from "react";
import {
  TbLockOpen,
  TbMaximize,
  TbMinus,
  TbPlus,
  TbSettings,
} from "react-icons/tb";
import { useReactFlow } from "reactflow";

import { Menu } from "../../../components/menu";
import { Tooltip } from "../../../components/tooltip";
import { PANEL_MARGIN } from "../../../constants/ui";
import { EditorContext } from "../../../state/editor-context";

const BASE_OFFSET = 12;

const containerStyle = css({
  position: "absolute",
  display: "flex",
  flexDirection: "column",
  gap: "1",
  zIndex: "[900]",
});

const buttonStyle = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "6",
  height: "6",
  backgroundColor: "white",
  borderWidth: "thin",
  borderColor: "neutral.a30",
  borderRadius: "md",
  cursor: "pointer",
  color: "neutral.s110",
  padding: "0",
  transition: "[all 0.15s ease]",
  _hover: {
    backgroundColor: "neutral.s10",
    color: "neutral.s120",
    transform: "[scale(1.05)]",
  },
  _active: {
    transform: "[scale(0.92)]",
  },
});

export const ViewportControls: React.FC = () => {
  const { zoomIn, zoomOut } = useReactFlow();
  const {
    collapseAllPanels,
    selectedResourceId,
    propertiesPanelWidth,
    isBottomPanelOpen,
    bottomPanelHeight,
  } = use(EditorContext);

  const isPropertiesPanelVisible = selectedResourceId !== null;
  const rightOffset =
    BASE_OFFSET +
    (isPropertiesPanelVisible ? propertiesPanelWidth + PANEL_MARGIN : 0);
  const bottomOffset =
    BASE_OFFSET + (isBottomPanelOpen ? bottomPanelHeight + PANEL_MARGIN : 0);

  return (
    <div
      className={containerStyle}
      style={{ right: rightOffset, bottom: bottomOffset }}
    >
      <Tooltip content="Zoom in" display="inline" placement="left">
        <button
          type="button"
          className={buttonStyle}
          aria-label="Zoom in"
          onClick={() => zoomIn()}
        >
          <TbPlus size={14} />
        </button>
      </Tooltip>
      <Tooltip content="Zoom out" display="inline" placement="left">
        <button
          type="button"
          className={buttonStyle}
          aria-label="Zoom out"
          onClick={() => zoomOut()}
        >
          <TbMinus size={14} />
        </button>
      </Tooltip>
      <Tooltip content="Fullscreen" display="inline" placement="left">
        <button
          type="button"
          className={buttonStyle}
          aria-label="Fullscreen"
          onClick={collapseAllPanels}
        >
          <TbMaximize size={14} />
        </button>
      </Tooltip>
      <Tooltip content="Lock view" display="inline" placement="left">
        <button
          type="button"
          className={buttonStyle}
          aria-label="Lock view"
          onClick={() => {
            // Placeholder for future lock view functionality
          }}
        >
          <TbLockOpen size={14} />
        </button>
      </Tooltip>
      <Menu
        placement="left-end"
        trigger={
          <button type="button" className={buttonStyle} aria-label="Settings">
            <TbSettings size={14} />
          </button>
        }
        items={[
          {
            id: "placeholder",
            label: "Settings coming soon",
            disabled: true,
          },
        ]}
      />
    </div>
  );
};
