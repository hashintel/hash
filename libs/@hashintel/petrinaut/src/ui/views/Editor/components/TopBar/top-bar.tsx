import { use } from "react";

import {
  Button,
  SegmentedControl,
  TextInput,
  type SegmentedControlItem,
} from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";
import { SidebarIcon } from "@hashintel/ds-icons";

import { useComposesOnly } from "../../../../../react/document/use-composes-only";
import { ActualModeContext } from "../../../../../react/host/actual-mode-context";
import { NetManagementContext } from "../../../../../react/host/net-management-context";
import {
  useEditorActions,
  useEditorFields,
} from "../../../../../react/state/editor-context";
import { PluginToolbarItems } from "../../../../plugins/plugin-outlets";
import { EditorMenu } from "./editor-menu";
import { RunningExperimentsPopover } from "./running-experiments-popover";
import { VersionHistoryButton } from "./version-history-button";

import type { EditorGlobalMode } from "../../../../../react/navigation/navigation";

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
  hideNetManagementControls?: "all" | "except-title";
}

export const TopBar: React.FC<TopBarProps> = ({
  hideNetManagementControls,
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
          prefix={
            <SidebarIcon
              size={16}
              collapsed={!isLeftSidebarOpen}
              duration={240}
            />
          }
        />

        <EditorMenu
          showNetManagementItems={hideNetManagementControls === undefined}
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
        <RunningExperimentsPopover />
        <VersionHistoryButton />
        <PluginToolbarItems place="top-bar-end" />
      </div>
    </div>
  );
};
