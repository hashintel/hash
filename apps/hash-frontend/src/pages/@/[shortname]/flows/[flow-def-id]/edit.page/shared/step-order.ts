import type {
  StepDefinition,
  StepInputSource,
} from "@local/hash-isomorphic-utils/flows/types";

const getSourceStepIds = (source: StepInputSource) =>
  source.kind === "step-output" ? [source.stepId] : [];

/** The steps `step` or any step inside it runs after, by connection or data link. */
const getDependencyStepIds = (step: StepDefinition<string>): string[] => [
  ...(step.runAfter ?? []).map(({ stepId }) => stepId),
  ...(step.kind === "action"
    ? Object.values(step.inputs).flatMap(getSourceStepIds)
    : [
        ...getSourceStepIds(step.over),
        ...step.steps.flatMap(getDependencyStepIds),
      ]),
];

/** For each of `steps`, the others in `steps` it runs after, by connection or data link. */
export const getStepsBefore = (
  steps: StepDefinition<string>[],
): Map<string, string[]> => {
  const stepIds = new Set(steps.map(({ stepId }) => stepId));

  return new Map(
    steps.map((step) => [
      step.stepId,
      [...new Set(getDependencyStepIds(step))].filter(
        (stepId) => stepId !== step.stepId && stepIds.has(stepId),
      ),
    ]),
  );
};

const comparePositions = (
  first: StepDefinition<string>,
  second: StepDefinition<string>,
) =>
  first.position && second.position
    ? first.position.x - second.position.x ||
      first.position.y - second.position.y
    : 0;

/**
 * `steps` in run order; ties go left to right, then top to bottom, then as listed. A cycle is broken at its first step
 * in that order.
 */
export const orderSteps = <Step extends StepDefinition<string>>(
  steps: Step[],
): Step[] => {
  const stepsBefore = getStepsBefore(steps);
  const remaining = steps.toSorted(comparePositions);
  const ordered: Step[] = [];
  const placed = new Set<string>();

  for (;;) {
    const nextIndex = remaining.findIndex((step) =>
      (stepsBefore.get(step.stepId) ?? []).every((stepId) =>
        placed.has(stepId),
      ),
    );
    const [next] = remaining.splice(Math.max(nextIndex, 0), 1);

    if (!next) {
      return ordered;
    }

    ordered.push(next);
    placed.add(next.stepId);
  }
};
