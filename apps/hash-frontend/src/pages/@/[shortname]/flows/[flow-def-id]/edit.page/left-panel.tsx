import { useState } from "react";

import { Button, SegmentedControl } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";

import { AddTab } from "./left-panel/add-tab";
import { RunStatus } from "./left-panel/run-status";
import { TreeRow } from "./left-panel/shared/tree-row";
import { getGroupIds, getStepsTree } from "./left-panel/steps-tree";
import { CollapseButton } from "./shared/collapse-button";
import { useItemNames } from "./shared/item-name";
import {
  countSteps,
  getStepDisplay,
  startDisplay,
} from "./shared/step-display";
import { notReachedMark, startMark } from "./shared/step-states";

import type { StepsTreeItem } from "./left-panel/steps-tree";
import type { StepRunMark } from "./shared/step-states";
import type { FlowDefinition } from "@local/hash-isomorphic-utils/flows/types";

type LeftPanelTab = "steps" | "add";

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

const StepsTree = ({
  tree,
  depth,
  selectedStepIds,
  collapsedGroupIds,
  onToggleGroup,
  onStepClick,
  runMarks,
  getItemName,
}: {
  tree: StepsTreeItem[];
  depth: number;
  selectedStepIds: Set<string>;
  collapsedGroupIds: Set<string>;
  onToggleGroup: (stepId: string) => void;
  onStepClick: (stepId: string) => void;
  runMarks: Map<string, StepRunMark> | null;
  getItemName: (forEachStepId: string) => string;
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
          label={
            description ||
            (step.kind === "for-each"
              ? `For each ${getItemName(step.stepId)}`
              : title)
          }
          selected={selectedStepIds.has(step.stepId)}
          emphasized={children !== null}
          onClick={() => onStepClick(step.stepId)}
          expander={
            children && (
              <CollapseButton
                collapsed={collapsed}
                onToggle={() => onToggleGroup(step.stepId)}
              />
            )
          }
          stepCount={runMarks ? undefined : children?.length}
          status={
            runMarks && (
              <RunStatus mark={runMarks.get(step.stepId) ?? notReachedMark} />
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
            runMarks={runMarks}
            getItemName={getItemName}
          />
        )}
      </div>
    );
  });

type StepsSectionProps = {
  flowDefinition: FlowDefinition<string>;
  selectedStepIds: string[];
  onStepClick: (stepId: string) => void;
  /** Shared with the canvas, which collapses the same for-each boxes. */
  collapsedGroupIds: Set<string>;
  onToggleGroup: (stepId: string) => void;
  onCollapseAll: (stepIds: string[]) => void;
};

/** The flow's steps, after Start. In a run, each shows its state, and a group counts its items rather than its steps. */
const StepsSection = ({
  flowDefinition,
  selectedStepIds,
  onStepClick,
  collapsedGroupIds,
  onToggleGroup,
  onCollapseAll,
  runMarks,
}: StepsSectionProps & { runMarks: Map<string, StepRunMark> | null }) => {
  const { steps } = flowDefinition;
  const getItemName = useItemNames(flowDefinition);
  const tree = getStepsTree(steps);
  const groupIds = getGroupIds(tree);

  return (
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
          disabled={groupIds.every((stepId) => collapsedGroupIds.has(stepId))}
          onClick={() => onCollapseAll(groupIds)}
        />
      </div>
      <TreeRow
        depth={0}
        icon={startDisplay.icon}
        tone={startDisplay.tone}
        label={startDisplay.description}
        status={runMarks && <RunStatus mark={startMark} />}
      />
      <StepsTree
        tree={tree}
        depth={0}
        selectedStepIds={new Set(selectedStepIds)}
        collapsedGroupIds={collapsedGroupIds}
        onToggleGroup={onToggleGroup}
        onStepClick={onStepClick}
        runMarks={runMarks}
        getItemName={getItemName}
      />
    </div>
  );
};

/** The flow editor's left panel: the flow's steps, and the steps that can be added to it. */
export const LeftPanel = ({
  onAddStep,
  ...stepsSectionProps
}: StepsSectionProps & {
  /** Adds a step that runs the action, in view. */
  onAddStep: (actionDefinitionId: string) => void;
}) => {
  const [tab, setTab] = useState<LeftPanelTab>("steps");

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
        <StepsSection {...stepsSectionProps} runMarks={null} />
      ) : (
        <AddTab onAddStep={onAddStep} />
      )}
    </div>
  );
};

/** A run's left panel: the steps of the flow it ran, each with its state in the run. */
export const RunLeftPanel = (
  props: StepsSectionProps & {
    /** Each step's mark in the run, by step id. A step with none is not reached. */
    runMarks: Map<string, StepRunMark>;
  },
) => (
  <div className={panel}>
    <StepsSection {...props} />
  </div>
);
