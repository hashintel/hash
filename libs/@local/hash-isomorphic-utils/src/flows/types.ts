import type { VersionedUrl } from "@blockprotocol/type-system";
import type {
  Entity,
  EntityPropertiesObject,
  EntityTypeWithMetadata,
  EntityUuid,
} from "@local/hash-subgraph";

import type { ActionDefinitionId } from "./action-definitions";
import type { TriggerDefinitionId } from "./trigger-definitions";

export type DeepReadOnly<T> = {
  readonly [key in keyof T]: DeepReadOnly<T[key]>;
};

/**
 * Payload
 */

export type WebPage = {
  url: string;
  title: string;
  textContent: string;
};

export type ProposedEntity = {
  entityTypeId: VersionedUrl;
  properties: EntityPropertiesObject;
};

export type PayloadKindValues = {
  Text: string;
  Number: number;
  Boolean: boolean;
  ProposedEntity: ProposedEntity;
  Entity: Entity;
  WebPage: WebPage;
  EntityType: EntityTypeWithMetadata;
  VersionedUrl: VersionedUrl;
};

export type PayloadKind = keyof PayloadKindValues;

export type SingularPayload = {
  [K in keyof PayloadKindValues]: {
    kind: K;
    value: PayloadKindValues[K];
  };
}[keyof PayloadKindValues];

export type ArrayPayload = {
  [K in keyof PayloadKindValues]: {
    kind: K;
    value: PayloadKindValues[K][];
  };
}[keyof PayloadKindValues];

export type Payload = SingularPayload | ArrayPayload;

/**
 * Step Definition
 */

export type InputDefinition = {
  name: string;
  description?: string;
  oneOfPayloadKinds: PayloadKind[];
  array: boolean;
  required: boolean;
  default?: Payload;
};

export type OutputDefinition<A extends boolean = boolean> = {
  name: string;
  description?: string;
  payloadKind: PayloadKind;
  array: A;
};

export type TriggerDefinition = {
  kind: "trigger";
  triggerDefinitionId: TriggerDefinitionId;
  name: string;
  outputs?: OutputDefinition[];
};

export type ActionDefinition = {
  kind: "action";
  actionDefinitionId: ActionDefinitionId;
  name: string;
  description: string;
  inputs: InputDefinition[];
  outputs: OutputDefinition[];
};

/**
 * Flow Definition
 */

export type StepInputSource<P extends Payload = Payload> = {
  inputName: string;
} & (
  | {
      /**
       * This refers to an output from a previous step, and can also refer
       * to outputs from the `trigger` by specifying `sourceStepId: "trigger"`.
       */
      kind: "step-output";
      sourceStepId: string;
      sourceStepOutputName: string;
      fallbackValue?: P;
    }
  | {
      /**
       * A hardcoded value in the flow definition, which is constant
       * for all flow runs.
       */
      kind: "hardcoded";
      value: P;
    }
);

export type ActionStepDefinition<
  AdditionalInputSources extends { inputName: string } | null = null,
> = {
  kind: "action";
  stepId: string;
  actionDefinitionId: ActionDefinitionId;
  inputSources: AdditionalInputSources extends null
    ? StepInputSource[]
    : (StepInputSource | AdditionalInputSources)[];
  retryCount?: number;
};

export type ParallelGroupStepDefinition = {
  kind: "parallel-group";
  stepId: string;
  /**
   * The input source to parallelize on must expect an `ArrayPayload`,
   * so that each item in the array can be processed by the steps in
   * parallel.
   */
  inputSourceToParallelizeOn: StepInputSource<ArrayPayload>;
  /**
   * The steps that will be executed in parallel branches for each payload
   * item in the provided `ArrayPayload`.
   */
  steps: (
    | ActionStepDefinition<{
        /**
         * This additional input source refers to the dispersed input
         * for a parallel group.
         */
        inputName: string;
        kind: "parallel-group-input";
      }>
    | ParallelGroupStepDefinition
  )[];
  /**
   * The aggregate output of the parallel group must be defined
   * as an `array` output.
   */
  aggregateOutput: OutputDefinition<true> & {
    /**
     * The step ID for the step in the parallel group that will produce the
     * _singular_ output that will ber aggregated in an array as the
     * output for the parallel group.
     */
    stepId: string;
    /**
     * The name of the output that will be aggregated in an array from the
     */
    stepOutputName: string;
  };
};

export type StepDefinition = ActionStepDefinition | ParallelGroupStepDefinition;

type FlowDefinitionTrigger =
  | {
      kind: "trigger";
      triggerDefinitionId: Exclude<TriggerDefinitionId, "scheduledTrigger">;
      outputs?: OutputDefinition[];
    }
  | {
      kind: "scheduled";
      triggerDefinitionId: "scheduledTrigger";
      active: boolean;
      cronSchedule: string;
      outputs?: OutputDefinition[];
    };

export type FlowDefinition = {
  name: string;
  flowDefinitionId: EntityUuid;
  trigger: FlowDefinitionTrigger;
  steps: StepDefinition[];
  outputs: (OutputDefinition & {
    /**
     * The step ID for the step in the flow that will produce the
     * output.
     */
    stepId: string;
    /**
     * The name of the output in the step
     */
    stepOutputName: string;
  })[];
};

/**
 * Flow Step
 */

export type StepInput<P extends Payload = Payload> = {
  inputName: string;
  payload: P;
};

export type StepOutput<P extends Payload = Payload> = {
  outputName: string;
  payload: P;
};

export type ActionStep = {
  stepId: string;
  kind: "action";
  actionDefinitionId: ActionDefinitionId;
  retries?: number;
  inputs?: StepInput[];
  outputs?: StepOutput[];
};

export type ParallelGroupStep = {
  stepId: string;
  kind: "parallel-group";
  inputToParallelizeOn?: StepInput<ArrayPayload>;
  steps?: FlowStep[];
  aggregateOutput?: StepOutput<ArrayPayload>;
};

export type FlowStep = ActionStep | ParallelGroupStep;

/**
 * Flow
 */

export type FlowTrigger = {
  triggerDefinitionId: TriggerDefinitionId;
  outputs?: StepOutput[];
};

export type Flow = {
  flowId: EntityUuid;
  trigger: FlowTrigger;
  flowDefinitionId: EntityUuid;
  steps: FlowStep[];
  outputs?: StepOutput[];
};
