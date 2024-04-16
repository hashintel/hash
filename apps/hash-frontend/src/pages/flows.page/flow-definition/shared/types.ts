import type {
  ActionDefinition,
  ActionStepDefinition,
  ActionStepWithParallelInput,
  ParallelGroupStepDefinition,
  TriggerDefinition,
} from "@local/hash-isomorphic-utils/flows/types";
import type { Node } from "reactflow";

type DeepReadOnly<T> = {
  readonly [key in keyof T]: DeepReadOnly<T[key]>;
};

export type NodeData = {
  groupId?: number;
  stepDefinition: DeepReadOnly<ActionDefinition | TriggerDefinition> | null;
  label: string;
  inputSources:
    | ActionStepDefinition["inputSources"]
    | ActionStepWithParallelInput["inputSources"]
    | ParallelGroupStepDefinition["inputSourceToParallelizeOn"][];
};

export type CustomNodeType = Node<NodeData>;
