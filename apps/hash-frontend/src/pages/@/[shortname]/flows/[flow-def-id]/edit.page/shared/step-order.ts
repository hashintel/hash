import type {
  StepDefinition,
  StepInputSource,
} from "@local/hash-isomorphic-utils/flows/types";

const getSourceStepIds = (source: StepInputSource) =>
  source.kind === "step-output" ? [source.stepId] : [];

/** The ids of the steps a step takes values from, including through the steps inside it. */
const getDataSourceStepIds = (step: StepDefinition<string>): string[] =>
  step.kind === "action"
    ? Object.values(step.inputs).flatMap(getSourceStepIds)
    : [
        ...getSourceStepIds(step.over),
        ...step.steps.flatMap(getDataSourceStepIds),
      ];

/**
 * For each of `steps`, the ids of the others it runs after: those it has a connection from, and those it takes a value
 * from (a data link). Steps outside `steps` are left out.
 */
export const getStepsBefore = (
  steps: StepDefinition<string>[],
): Map<string, string[]> => {
  const stepIds = new Set(steps.map(({ stepId }) => stepId));

  return new Map(
    steps.map((step) => [
      step.stepId,
      [
        ...new Set([
          ...(step.runAfter ?? []).map(({ stepId }) => stepId),
          ...getDataSourceStepIds(step),
        ]),
      ].filter((stepId) => stepId !== step.stepId && stepIds.has(stepId)),
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
 * `steps` in the order they run: each after every step it runs after (see `getStepsBefore`). Steps that could run in
 * either order go left to right, then top to bottom, then as listed. Steps in a cycle follow the rest, as listed.
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
