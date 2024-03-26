import type { VersionedUrl } from "@blockprotocol/type-system";
import type {
  Entity,
  EntityPropertiesObject,
  EntityTypeWithMetadata,
} from "@local/hash-subgraph";

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
 * Node Definition
 */

export type InputDefinition = {
  name: string;
  description?: string;
  oneOfPayloadKinds: PayloadKind[];
  array: boolean;
  required: boolean;
};

export type OutputDefinition<A extends boolean = boolean> = {
  name: string;
  description?: string;
  payloadKind: PayloadKind;
  array: A;
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

/**
 * Flow Definition
 */

export type NodeInputSource<P extends Payload = Payload> = {
  inputName: string;
} & (
  | {
      /**
       * This refers to an output from a previous node, and can also refer
       * to outputs from the `trigger` by specifying `sourceNodeId: "trigger"`.
       */
      kind: "node-output";
      sourceNodeId: string;
      sourceNodeOutputName: string;
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

export type ActionNodeDefinition<
  AdditionalInputSources extends { inputName: string } | null = null,
> = {
  kind: "action";
  nodeId: string;
  actionDefinition: DeepReadOnly<ActionDefinition>;
  inputSources: AdditionalInputSources extends null
    ? NodeInputSource[]
    : (NodeInputSource | AdditionalInputSources)[];
  retryCount?: number;
};

export type ParallelGroupDefinition = {
  kind: "parallel-group";
  nodeId: string;
  /**
   * The input source to parallelize on must expect an `ArrayPayload`,
   * so that each item in the array can be processed by the nodes in
   * parallel.
   */
  inputSourceToParallelizeOn: NodeInputSource<ArrayPayload>;
  /**
   * The nodes that will be executed in parallel branches for each payload
   * item in the provided `ArrayPayload`.
   */
  nodes: ActionNodeDefinition<{
    /**
     * This additional input source refers to the dispersed input
     * for a parallel group.
     */
    inputName: string;
    kind: "parallel-group-input";
  }>[];
  /**
   * The aggregate output of the parallel group must be defined
   * as an `array` output.
   */
  aggregateOutput: OutputDefinition<true> & {
    /**
     * The node ID for the node in the parallel group that will produce the
     * _singular_ output that will ber aggregated in an array as the
     * output for the parallel group.
     */
    nodeId: string;
    /**
     * The name of the output that will be aggregated in an array from the
     */
    nodeOutputName: string;
  };
};

type NodeDefinition = ActionNodeDefinition | ParallelGroupDefinition;

export type FlowDefinition = {
  name: string;
  trigger: {
    definition: TriggerDefinition;
    outputs?: OutputDefinition[];
  };
  nodes: NodeDefinition[];
};

/**
 * Flow Node
 */

export type NodeInput = {
  inputName: string;
  payload: Payload;
};

export type NodeOutput = {
  outputName: string;
  payload: Payload;
};

export type ActionNode = {
  actionId: string;
  kind: "action";
  actionDefinition: DeepReadOnly<ActionDefinition>;
  retries?: number;
  inputs?: NodeInput[];
  outputs?: NodeOutput[];
};

export type ParallelGroupNode = {
  parallelGroupId: string;
  kind: "parallel-group";
  inputToParallelizeOn?: NodeInput;
  nodes?: Exclude<FlowNode, ParallelGroupNode>[];
  aggregateOutput?: NodeOutput;
};

export type FlowNode = ActionNode | ParallelGroupNode;

/**
 * Flow
 */

export type FlowTrigger = {
  definition: DeepReadOnly<TriggerDefinition>;
  outputs?: NodeOutput[];
};

type FlowInput = {
  nodeId: string;
  inputName: string;
  payload: Payload;
};

export type Flow = {
  flowId: string;
  trigger: FlowTrigger;
  definition: FlowDefinition;
  inputs?: FlowInput;
  nodes: FlowNode[];
};
