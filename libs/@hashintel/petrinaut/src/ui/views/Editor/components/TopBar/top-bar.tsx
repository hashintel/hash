import { use } from "react";

import {
  Button,
  Menu,
  SegmentedControl,
  TextInput,
  type MenuItem,
  type SegmentedControlItem,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { ActualModeContext } from "../../../../../react/actual-mode-context";
import { NetManagementContext } from "../../../../../react/net-management-context";
import {
  type EditorGlobalMode,
  useEditorActions,
  useEditorFields,
} from "../../../../../react/state/editor-context";
import { useComposesOnly } from "../../../../../react/state/use-composes-only";
import { UserSettingsContext } from "../../../../../react/state/user-settings-context";
import { MenuIcon, SidebarIcon } from "../../../../experimental-icons";
import { PluginToolbarItems } from "../../../../plugins/plugin-outlets";
import { RunningExperimentsPopover } from "./running-experiments-popover";
import { VersionHistoryButton } from "./version-history-button";

import type { ExperimentRecord } from "../../../../../react/experiments/context";

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

const readonlyTitleStyles = css({
  minWidth: "[0]",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

const modeItems = (
  actualModeAvailable: boolean,
): SegmentedControlItem<EditorGlobalMode>[] => [
  { label: "Edit", value: "edit", iconName: "shapes" },
  { label: "Simulate", value: "simulate", iconName: "play" },
  {
    label: "Actual",
    value: "actual",
    iconName: "circleFilled",
    disabled: !actualModeAvailable,
    tooltip: actualModeAvailable
      ? "View actual execution state."
      : "Actual mode is not yet available.",
  },
];

const ignoreTitle = () => {};

interface TopBarProps {
  menuItems: MenuItem[];
  hideNetManagementControls?: "all" | "except-title";
  onRunningExperimentClick?: (experiment: ExperimentRecord) => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  menuItems,
  hideNetManagementControls,
  onRunningExperimentClick,
}) => {
  const { globalMode, isLeftSidebarOpen } = useEditorFields(
    "globalMode",
    "isLeftSidebarOpen",
  );
  const { setGlobalMode, setLeftSidebarOpen, setSearchOpen } =
    useEditorActions();
  // A host that takes no new title gives no `setTitle`.
  const { title, setTitle } = use(NetManagementContext);
  const actualMode = use(ActualModeContext);
  const { enableExperimentalIconPack } = use(UserSettingsContext);
  const composesOnly = useComposesOnly();

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
          {...(enableExperimentalIconPack
            ? {
                prefix: (
                  <SidebarIcon
                    size={16}
                    collapsed={!isLeftSidebarOpen}
                    duration={240}
                  />
                ),
              }
            : { iconName: "sidebar" })}
        />

        <Menu
          trigger={
            <Button
              aria-label="Menu"
              size="sm"
              variant="ghost"
              tooltip="Menu"
              {...(enableExperimentalIconPack
                ? { prefix: <MenuIcon size={16} duration={200} /> }
                : { iconName: "bars" })}
            />
          }
          items={menuItems}
        />

        <PluginToolbarItems place="top-bar-start" />

        {hideNetManagementControls !== "all" && (
          <TextInput
            variant="subtle"
            value={title}
            onChange={setTitle ?? ignoreTitle}
            readonly={!setTitle}
            placeholder="Process"
            className={cx(titleStyles, !setTitle && readonlyTitleStyles)}
            size="sm"
          />
        )}
      </div>

      {/* Center section - mode switcher. An editor that only composes has one mode. */}
      {composesOnly ? null : (
        <SegmentedControl
          size="sm"
          value={globalMode}
          items={modeItems(actualMode.available)}
          onChange={setGlobalMode}
        />
      )}

      <div className={rightSectionStyle}>
        <RunningExperimentsPopover
          onExperimentClick={onRunningExperimentClick}
        />
        <VersionHistoryButton />
        <PluginToolbarItems place="top-bar-end" />
      </div>
    </div>
  );
};
