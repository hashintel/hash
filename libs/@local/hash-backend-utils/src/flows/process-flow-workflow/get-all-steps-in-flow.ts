import type {
  FlowStep,
  ForEachStep,
  LocalFlowRun,
} from "@local/hash-isomorphic-utils/flows/types";

const getAllStepsInForEachStep = (forEachStep: ForEachStep): FlowStep[] => [
  ...(forEachStep.steps ?? []),
  ...(forEachStep.steps?.flatMap((step) =>
    step.kind === "for-each" ? getAllStepsInForEachStep(step) : [],
  ) ?? []),
];

const getAllStepsInFlow = (flow: LocalFlowRun): FlowStep[] => [
  ...flow.steps,
  ...flow.steps.flatMap((step) =>
    step.kind === "for-each" ? getAllStepsInForEachStep(step) : [],
  ),
];

/** Every step in the run, by id. */
export const getStepsInFlowById = (flow: LocalFlowRun): Map<string, FlowStep> =>
  new Map(getAllStepsInFlow(flow).map((step) => [step.stepId, step]));
