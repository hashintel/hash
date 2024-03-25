import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Entity, EntityTypeWithMetadata } from "@local/hash-subgraph";

import type { ProposedEntity } from "../ai-inference-types";

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

export type Payload = {
  [K in keyof PayloadKindValues]: {
    kind: K;
    value: PayloadKindValues[K];
  };
}[keyof PayloadKindValues];

/**
 * Step Definition
 */

export type InputDefinition = {
  name: string;
  description?: string;
  oneOfPayloadKinds: PayloadKind[];
  array: boolean;
  required: boolean;
};

export type OutputDefinition = {
  name: string;
  description?: string;
  payloadKind: PayloadKind;
  array: boolean;
};

export type TriggerDefinition = {
  kind: "trigger";
  name: string;
  outputs?: OutputDefinition[];
};

export type ActionDefinition = {
  kind: "action";
  name: string;
  inputs: InputDefinition[];
  outputs: OutputDefinition[];
};

export type StepDefinition = ActionDefinition;

/**
 * Flow Definition
 */

export type StepInputSource = {
  inputName: string;
} & (
  | {
      /**
       * This refers to an output from a previous step, and can also refer
       * to outputs from the `trigger` by specifying `sourceNodeId: "trigger"`.
       *
       */
      kind: "step-output";
      sourceNodeId: string;
      sourceNodeOutputName: string;
      fallbackValue?: Payload;
    }
  | {
      /**
       * A hardcoded value in the flow definition, which is constant
       * for all flow runs.
       */
      kind: "hardcoded";
      value: Payload;
    }
);

export type FlowDefinition = {
  name: string;
  trigger: {
    definition: TriggerDefinition;
    outputs?: OutputDefinition[];
  };
  nodes: {
    nodeId: string;
    definition: DeepReadOnly<StepDefinition>;
    inputSources: StepInputSource[];
    retryCount?: number;
  }[];
};

/**
 * Step
 */

export type StepInput = {
  inputName: string;
  payload: Payload | Payload[];
};

export type StepOutput = {
  outputName: string;
  payload: Payload | Payload[];
};

export type Step = {
  stepId: string;
  definition: DeepReadOnly<StepDefinition>;
  retries?: number;
  inputs?: StepInput[];
  outputs?: StepOutput[];
};

/**
 * Flow
 */

export type FlowTrigger = {
  definition: DeepReadOnly<TriggerDefinition>;
  outputs?: StepOutput[];
};

type FlowInput = {
  stepNodeId: string;
  inputName: string;
  payload: Payload;
};

export type Flow = {
  flowId: string;
  trigger: FlowTrigger;
  definition: FlowDefinition;
  inputs?: FlowInput;
  steps: Step[];
};
