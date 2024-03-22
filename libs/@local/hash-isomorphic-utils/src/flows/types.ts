import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Entity, EntityTypeWithMetadata } from "@local/hash-subgraph";

import type { ProposedEntity } from "../ai-inference-types";

/**
 * Payload
 */

export type WebPage = {
  url: string;
  title: string;
  textContent: string;
};

type PayloadKindValues = {
  Text: string;
  Number: number;
  Boolean: boolean;
  ProposedEntity: ProposedEntity;
  Entity: Entity;
  WebPage: WebPage;
  EntityType: EntityTypeWithMetadata;
  VersionedUrl: VersionedUrl;
};

type PayloadKind = keyof PayloadKindValues;

type Payload = {
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

type StepInputSource = {
  inputName: string;
} & (
  | {
      kind: "step-output";
      sourceNodeId: string;
      sourceNodeOutputName: string;
      fallbackValue?: Payload;
    }
  /**
   * An output provided by the trigger that started the flow
   * (e.g. `userVisitedWebPageTrigger` provides a `visitedWebPAge` output)
   */
  | {
      kind: "flow-trigger";
      triggerOutputName: string;
      fallbackValue?: Payload;
    }
  /**
   * A hardcoded value in the flow definition, which is constant
   * for all flow runs.
   */
  | {
      kind: "hardcoded";
      value: Payload;
    }
  /**
   * A value provided when the flow run is started, probably by the user
   */
  | {
      kind: "flow-input";
      fallbackValue?: Payload;
    }
);

export type FlowDefinition = {
  name: string;
  trigger: TriggerDefinition;
  nodes: {
    nodeId: string;
    definition: StepDefinition;
    inputSources: StepInputSource[];
    retryCount?: number;
  }[];
};

/**
 * Step
 */

type StepInput = {
  inputName: string;
  payload: Payload;
};

type StepOutput = {
  outputName: string;
  payload: Payload;
};

export type Step = {
  stepId: string;
  definition: StepDefinition;
  retries?: number;
  inputs?: StepInput[];
  outputs?: StepOutput[];
};

/**
 * Flow
 */

type FlowTrigger = {
  definition: TriggerDefinition;
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
