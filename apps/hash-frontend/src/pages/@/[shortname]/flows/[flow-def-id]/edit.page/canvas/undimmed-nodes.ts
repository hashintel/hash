import { findStep } from "../shared/find-step";
import { getStepNodeId } from "./flow-graph";

import type { FlowNode } from "./flow-graph";
import type { StepDefinition } from "@local/hash-isomorphic-utils/flows/types";

/**
 * The nodes that stay as they are while the rest of a canvas is dimmed: those of the steps in `stepIds`, and of the
 * steps drawn inside them. A step in a collapsed for-each step isn't drawn, so the for-each step stands for it.
 */
export const getUndimmedNodeIds = ({
  stepIds,
  steps,
  collapsedStepIds,
  nodes,
}: {
  stepIds: string[];
  steps: StepDefinition<string>[];
  collapsedStepIds: Set<string>;
  nodes: Pick<FlowNode, "id" | "parentId">[];
}): Set<string> => {
  const undimmed = new Set(
    stepIds.map((stepId) => {
      const collapsedParent = steps.find(
        (step) =>
          step.kind === "for-each" &&
          collapsedStepIds.has(step.stepId) &&
          findStep(step.steps, stepId),
      );

      return getStepNodeId(collapsedParent?.stepId ?? stepId);
    }),
  );

  /* A for-each step's node comes before those of the steps inside it. */
  for (const { id, parentId } of nodes) {
    if (parentId !== undefined && undimmed.has(parentId)) {
      undimmed.add(id);
    }
  }

  return undimmed;
};
