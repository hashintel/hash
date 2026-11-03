import { Box, Stack, Typography } from "@mui/material";
import { useState } from "react";

import { Button, SegmentedControl } from "@hashintel/ds-components";

import { getGroupIds, getStepsTree } from "./left-panel/steps-tree";
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

/** The DS has no tree item (logged as a gap), so rows are drawn here. */
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
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 0.5,
      height: 32,
      pl: `${4 + depth * indentPerDepth}px`,
      pr: 1,
      borderRadius: "6px",
    }}
  >
    <Box sx={{ display: "flex", flexShrink: 0, width: 16 }}>{expander}</Box>
    <Box
      component={onClick ? "button" : "span"}
      type={onClick ? "button" : undefined}
      onClick={onClick}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        flex: 1,
        minWidth: 0,
        height: "100%",
        p: 0,
        border: "none",
        background: "none",
        textAlign: "left",
        cursor: onClick ? "pointer" : undefined,
      }}
    >
      <StepIconTile icon={icon} tone={tone} size="small" />
      <Box
        component="span"
        sx={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontSize: 14,
          fontWeight: expander ? 600 : 500,
          color: selected
            ? "var(--colors-neutral-fg-heading)"
            : "var(--colors-neutral-fg-body)",
        }}
      >
        {label}
      </Box>
    </Box>
    {suffix}
  </Box>
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
  selectedStepIds: string[];
  collapsedGroupIds: Set<string>;
  onToggleGroup: (stepId: string) => void;
  onStepClick: (stepId: string) => void;
}) =>
  tree.map(({ step, children }) => {
    const { title, description, icon, tone } = getStepDisplay(step);
    const collapsed = collapsedGroupIds.has(step.stepId);

    return (
      <Box key={step.stepId}>
        <TreeRow
          depth={depth}
          icon={icon}
          tone={tone}
          label={description || title}
          selected={selectedStepIds.includes(step.stepId)}
          onClick={() => onStepClick(step.stepId)}
          expander={
            children && (
              <Button
                variant="ghost"
                size="xxs"
                iconName={collapsed ? "chevronRight" : "chevronDown"}
                aria-label={collapsed ? "Expand" : "Collapse"}
                aria-expanded={!collapsed}
                onClick={() => onToggleGroup(step.stepId)}
              />
            )
          }
          suffix={
            children && (
              <Typography
                component="span"
                sx={{
                  flexShrink: 0,
                  fontSize: 12,
                  color: "var(--colors-neutral-fg-subtle)",
                }}
              >
                {countSteps(children.length)}
              </Typography>
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
      </Box>
    );
  });

/**
 * The flow editor's left panel: the flow's steps, and the steps that can be added to it. The Add tab's list comes in a
 * later issue; until then, it says what it will hold.
 */
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
    <Stack
      sx={{
        flexShrink: 0,
        width: 248,
        borderRight: ({ palette }) => `1px solid ${palette.gray[20]}`,
      }}
    >
      <Box sx={{ p: 1 }}>
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
      </Box>
      {tab === "steps" ? (
        <Stack sx={{ px: 1, py: 1, overflowY: "auto" }}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ pl: 0.5, pb: 0.5 }}
          >
            <Typography
              sx={{ fontSize: 12, color: ({ palette }) => palette.gray[50] }}
            >
              {/* Start counts as a step, as the design shows. */}
              {countSteps(steps.length + 1)}
            </Typography>
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
          </Stack>
          <TreeRow
            depth={0}
            icon={startDisplay.icon}
            tone={startDisplay.tone}
            label={startDisplay.description}
          />
          <StepsTree
            tree={tree}
            depth={0}
            selectedStepIds={selectedStepIds}
            collapsedGroupIds={collapsedGroupIds}
            onToggleGroup={onToggleGroup}
            onStepClick={onStepClick}
          />
        </Stack>
      ) : (
        <Typography
          sx={{
            px: 1.5,
            py: 1,
            fontSize: 14,
            color: ({ palette }) => palette.gray[60],
          }}
        >
          Actions you can add will be listed here.
        </Typography>
      )}
    </Stack>
  );
};
