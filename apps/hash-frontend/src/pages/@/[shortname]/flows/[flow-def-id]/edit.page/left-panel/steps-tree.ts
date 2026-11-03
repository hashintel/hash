import { orderSteps } from "../shared/step-order";

import type { StepDefinition } from "@local/hash-isomorphic-utils/flows/types";

export type StepsTreeItem = {
  step: StepDefinition<string>;
  /** The steps inside a for-each step, which make it a group; `null` for an action step. */
  children: StepsTreeItem[] | null;
};

/**
 * The Steps tab's list: the steps in the order they run, with each for-each step a group of the steps inside it, in
 * the order they run too.
 */
export const getStepsTree = (
  steps: StepDefinition<string>[],
): StepsTreeItem[] =>
  orderSteps(steps).map((step) => ({
    step,
    children: step.kind === "for-each" ? getStepsTree(step.steps) : null,
  }));

/** The ids of the for-each steps in a tree, at any depth. */
export const getGroupIds = (tree: StepsTreeItem[]): string[] =>
  tree.flatMap(({ step, children }) =>
    children ? [step.stepId, ...getGroupIds(children)] : [],
  );
