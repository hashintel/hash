import type { Flow, FlowStep } from "@local/hash-isomorphic-utils/flows/types";

export const getAllStepsInFlow = (flow: Flow): FlowStep[] => [
  ...flow.steps,
  ...flow.steps.flatMap((step) =>
    step.kind === "parallel-group" ? step.steps ?? [] : [],
  ),
];
