import type {
  FlowStep,
  LocalFlowRun,
  ParallelGroupStep,
} from "@local/hash-isomorphic-utils/flows/types";

const getAllStepsInParallelGroupStep = (
  parallelGroupStep: ParallelGroupStep,
): FlowStep[] => [
  ...(parallelGroupStep.steps ?? []),
  ...(parallelGroupStep.steps?.flatMap((step) =>
    step.kind === "parallel-group" ? getAllStepsInParallelGroupStep(step) : [],
  ) ?? []),
];

export const getAllStepsInFlow = (flow: LocalFlowRun): FlowStep[] => [
  ...flow.steps,
  ...flow.steps.flatMap((step) =>
    step.kind === "parallel-group" ? getAllStepsInParallelGroupStep(step) : [],
  ),
];
