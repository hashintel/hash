import { use } from "react";

import {
  Button,
  Menu,
  TextInput,
  type MenuItem,
} from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import {
  EditorContext,
  type EditorState,
} from "../../../../../react/state/editor-context";
import { UndoRedoContext } from "../../../../../react/state/undo-redo-context";
import { ModeSelector } from "./mode-selector";
import { RunningExperimentsPopover } from "./running-experiments-popover";
import { VersionHistoryButton } from "./version-history-button";

import type { ExperimentRecord } from "../../../../../react/experiments/context";
import type { PetrinautSlots } from "../../../../types/petrinaut-slots";

const topBarStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[12px]",
  height: "16",
  boxSizing: "border-box",
  padding: "[16px]",
  backgroundColor: "neutral.s00",
  outlineWidth: "[1px]",
  outlineStyle: "solid",
  outlineColor: "neutral.s40",
  flexShrink: 0,
  zIndex: "sticky",
});

const leftSectionStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[6px]",
  flex: "[1 0 0]",
  minWidth: "[0]",
});

const rightSectionStyle = css({
  display: "flex",
  alignItems: "center",
  gap: "[8px]",
  flex: "[1 0 0]",
  justifyContent: "flex-end",
  minWidth: "[0]",
});

const titleStyles = css({
  marginX: "2",
  fontWeight: "medium",
});

interface TopBarProps {
  actualModeAvailable: boolean;
  menuItems: MenuItem[];
  title: string;
  onTitleChange: (value: string) => void;
  hideNetManagementControls?: "all" | "except-title";
  mode: EditorState["globalMode"];
  onModeChange: (mode: EditorState["globalMode"]) => void;
  onRunningExperimentClick?: (experiment: ExperimentRecord) => void;
  slots?: PetrinautSlots;
}

export const TopBar: React.FC<TopBarProps> = ({
  actualModeAvailable,
  menuItems,
  title,
  onTitleChange,
  hideNetManagementControls,
  mode,
  onModeChange,
  onRunningExperimentClick,
  slots,
}) => {
  const { isLeftSidebarOpen, setLeftSidebarOpen, setSearchOpen } =
    use(EditorContext);
  const undoRedo = use(UndoRedoContext);

  return (
    <div className={topBarStyle}>
      <div className={leftSectionStyle}>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setLeftSidebarOpen(!isLeftSidebarOpen);
            if (isLeftSidebarOpen) {
              setSearchOpen(false);
            }
          }}
          aria-label={isLeftSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          tooltip={isLeftSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          iconName="sidebar"
        />

        <Menu
          trigger={
            <Button
              aria-label="Menu"
              size="sm"
              variant="ghost"
              tooltip="Menu"
              iconName="bars"
            />
          }
          items={menuItems}
        />

        {slots?.topBarStart}

        {hideNetManagementControls !== "all" && (
          <TextInput
            variant="subtle"
            value={title}
            onChange={onTitleChange}
            placeholder="Process"
            className={titleStyles}
            size="sm"
            style={slots?.titleStyle}
          />
        )}
      </div>

      {/* Center section - mode switcher */}
      <ModeSelector
        actualModeAvailable={actualModeAvailable}
        mode={mode}
        onChange={onModeChange}
      />

      <div className={rightSectionStyle}>
        <RunningExperimentsPopover
          onExperimentClick={onRunningExperimentClick}
        />
        {undoRedo && <VersionHistoryButton />}
        {slots?.topBarEnd}
      </div>
    </div>
  );
};
