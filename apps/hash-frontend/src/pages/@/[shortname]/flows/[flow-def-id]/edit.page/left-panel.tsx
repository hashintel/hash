import { useState } from "react";

import { Button, SegmentedControl } from "@hashintel/ds-components";
import { css, cx } from "@hashintel/ds-helpers/css";

import { getGroupIds, getStepsTree } from "./left-panel/steps-tree";
import { CollapseButton } from "./shared/collapse-button";
import {
  countSteps,
  getStepDisplay,
  startDisplay,
} from "./shared/step-display";
import { StepIconTile } from "./shared/step-icon-tile";

import type { StepsTreeItem } from "./left-panel/steps-tree";
import type { StepTone } from "./shared/step-display";
import type { IconName } from "@hashintel/ds-components";
import type { StepDefinition } from "@local/hash-isomorphic-utils/flows/types";
import type { ReactNode } from "react";

type LeftPanelTab = "steps" | "add";

const indentPerDepth = 16;

const panel = css({
  display: "flex",
  flexDirection: "column",
  flexShrink: "0",
  width: "[248px]",
  borderRightWidth: "1px",
  borderRightStyle: "solid",
  borderRightColor: "bd.subtle",
});
const tabs = css({ p: "2" });
const stepsSection = css({
  display: "flex",
  flexDirection: "column",
  p: "2",
  overflowY: "auto",
});
const stepsHeader = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  pl: "1",
  pb: "1",
});
const stepCount = css({ textStyle: "xs", color: "fg.subtle" });
const addPlaceholder = css({
  textStyle: "sm",
  color: "fg.muted",
  px: "3",
  py: "2",
});

const row = css({
  display: "flex",
  alignItems: "center",
  gap: "1",
  height: "8",
  pr: "2",
});
const expanderSlot = css({ display: "flex", flexShrink: "0", width: "4" });
const rowLabel = css({
  flex: "1",
  justifyContent: "flex-start",
  textAlign: "left",
  "& > span:last-child": {
    minWidth: "0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});
const groupRowLabel = css({
  "& > span:last-child": { fontWeight: "semibold" },
});
const startRowLabel = css({
  display: "flex",
  alignItems: "center",
  gap: "1.5",
  flex: "1",
  minWidth: "0",
  px: "[9px]",
  textStyle: "sm",
  fontWeight: "medium",
  color: "neutral.s120",
});
const startRowText = css({ truncate: true });
const groupCount = css({
  flexShrink: "0",
  textStyle: "xs",
  color: "fg.subtle",
});

const TreeRow = ({
  depth,
  icon,
  tone,
  label,
  selected = false,
  expander,
  suffix,
  onClick,
}: {
  depth: number;
  icon: IconName;
  tone: StepTone;
  label: string;
  selected?: boolean;
  expander?: ReactNode;
  suffix?: ReactNode;
  onClick?: () => void;
}) => (
  <div className={row} style={{ paddingLeft: depth * indentPerDepth }}>
    <span className={expanderSlot}>{expander}</span>
    {onClick ? (
      <Button
        variant="ghost"
        size="sm"
        prefix={<StepIconTile icon={icon} tone={tone} size="small" />}
        pressed={selected}
        className={cx(rowLabel, expander ? groupRowLabel : undefined)}
        onClick={onClick}
      >
        {label}
      </Button>
    ) : (
      <span className={startRowLabel}>
        <StepIconTile icon={icon} tone={tone} size="small" />
        <span className={startRowText}>{label}</span>
      </span>
    )}
    {suffix}
  </div>
);

const StepsTree = ({
  tree,
  depth,
  selectedStepIds,
  collapsedGroupIds,
  onToggleGroup,
  onStepClick,
}: {
  tree: StepsTreeItem[];
  depth: number;
  selectedStepIds: Set<string>;
  collapsedGroupIds: Set<string>;
  onToggleGroup: (stepId: string) => void;
  onStepClick: (stepId: string) => void;
}) =>
  tree.map(({ step, children }) => {
    const { title, description, icon, tone } = getStepDisplay(step);
    const collapsed = collapsedGroupIds.has(step.stepId);

    return (
      <div key={step.stepId}>
        <TreeRow
          depth={depth}
          icon={icon}
          tone={tone}
          label={description || title}
          selected={selectedStepIds.has(step.stepId)}
          onClick={() => onStepClick(step.stepId)}
          expander={
            children && (
              <CollapseButton
                collapsed={collapsed}
                onToggle={() => onToggleGroup(step.stepId)}
              />
            )
          }
          suffix={
            children && (
              <span className={groupCount}>{countSteps(children.length)}</span>
            )
          }
        />
        {children && !collapsed && (
          <StepsTree
            tree={children}
            depth={depth + 1}
            selectedStepIds={selectedStepIds}
            collapsedGroupIds={collapsedGroupIds}
            onToggleGroup={onToggleGroup}
            onStepClick={onStepClick}
          />
        )}
      </div>
    );
  });

/** The flow editor's left panel: the flow's steps, and the steps that can be added to it. */
export const LeftPanel = ({
  steps,
  selectedStepIds,
  onStepClick,
  collapsedGroupIds,
  onToggleGroup,
  onCollapseAll,
}: {
  steps: StepDefinition<string>[];
  selectedStepIds: string[];
  onStepClick: (stepId: string) => void;
  /** Shared with the canvas, which collapses the same for-each boxes. */
  collapsedGroupIds: Set<string>;
  onToggleGroup: (stepId: string) => void;
  onCollapseAll: (stepIds: string[]) => void;
}) => {
  const [tab, setTab] = useState<LeftPanelTab>("steps");

  const tree = getStepsTree(steps);
  const groupIds = getGroupIds(tree);

  return (
    <div className={panel}>
      <div className={tabs}>
        <SegmentedControl
          size="md"
          aria-label="Left panel"
          value={tab}
          onChange={setTab}
          items={[
            { value: "steps", label: "Steps" },
            { value: "add", label: "Add" },
          ]}
        />
      </div>
      {tab === "steps" ? (
        <div className={stepsSection}>
          <div className={stepsHeader}>
            <p className={stepCount}>
              {/* Start counts as a step, as the design shows. */}
              {countSteps(steps.length + 1)}
            </p>
            <Button
              variant="ghost"
              size="xs"
              iconName="collapse"
              tooltip="Collapse all"
              disabled={groupIds.every((stepId) =>
                collapsedGroupIds.has(stepId),
              )}
              onClick={() => onCollapseAll(groupIds)}
            />
          </div>
          <TreeRow
            depth={0}
            icon={startDisplay.icon}
            tone={startDisplay.tone}
            label={startDisplay.description}
          />
          <StepsTree
            tree={tree}
            depth={0}
            selectedStepIds={new Set(selectedStepIds)}
            collapsedGroupIds={collapsedGroupIds}
            onToggleGroup={onToggleGroup}
            onStepClick={onStepClick}
          />
        </div>
      ) : (
        // TODO(FE-2125): list the actions that can be added, from their action definitions
        <p className={addPlaceholder}>
          Actions you can add will be listed here.
        </p>
      )}
    </div>
  );
};
