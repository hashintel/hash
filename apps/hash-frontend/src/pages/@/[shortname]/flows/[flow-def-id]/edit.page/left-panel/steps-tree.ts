import { orderSteps } from "../shared/step-order";

import type { StepDefinition } from "@local/hash-isomorphic-utils/flows/types";

export type StepsTreeItem = {
  step: StepDefinition<string>;
  /** `null` for an action step. */
  children: StepsTreeItem[] | null;
};

export const getStepsTree = (
  steps: StepDefinition<string>[],
): StepsTreeItem[] =>
  orderSteps(steps).map((step) => ({
    step,
    children: step.kind === "for-each" ? getStepsTree(step.steps) : null,
  }));

export const getGroupIds = (tree: StepsTreeItem[]): string[] =>
  tree.flatMap(({ step, children }) =>
    children ? [step.stepId, ...getGroupIds(children)] : [],
  );
