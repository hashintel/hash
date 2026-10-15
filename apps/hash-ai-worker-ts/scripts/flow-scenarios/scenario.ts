import type {
  FlowDefinitionWithId,
  FlowInputValues,
} from "@local/hash-isomorphic-utils/flows/types";
import type {
  FlowRunStatus,
  FlowStepStatus,
} from "@local/hash-isomorphic-utils/graphql/api-types.gen";

export type StepExpectation = {
  /** Defaults to `COMPLETED` when `outputs` or `absentOutputs` is given. */
  status?: `${FlowStepStatus}`;
  /** Expected payload values (the `value`, not the `{ kind, value }` wrapper) by output name, compared exactly. */
  outputs?: Record<string, unknown>;
  /** Outputs the step must not produce, such as the branch an If didn't take. */
  absentOutputs?: string[];
};

export type FlowScenario = {
  name: string;
  /** What the run proves, shown at the top of the report. */
  purpose?: string;
  flow: FlowDefinitionWithId;
  inputs: FlowInputValues;
  /** The shortname of the user to run as, in their own web. Defaults to `alice`. */
  user?: string;
  expect: {
    /** The run's status. Defaults to `COMPLETED`. */
    status?: `${FlowRunStatus}`;
    /** Expected payload values of the flow's outputs by output name, compared exactly. */
    outputs?: Record<string, unknown>;
    steps?: Record<string, StepExpectation>;
  };
};

export const defineScenario = (scenario: FlowScenario) => scenario;
