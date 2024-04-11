import type {
  ActionDefinition,
  ActionStepDefinition,
  ParallelGroupStepDefinition,
  TriggerDefinition,
} from "@local/hash-isomorphic-utils/flows/types";
import type { Node } from "reactflow";

type DeepReadOnly<T> = {
  readonly [key in keyof T]: DeepReadOnly<T[key]>;
};

export type NodeData = {
  stepDefinition: DeepReadOnly<ActionDefinition | TriggerDefinition> | null;
  label: string;
  inputSources:
    | ActionStepDefinition["inputSources"]
    | ParallelGroupStepDefinition["inputSourceToParallelizeOn"][];
};

export type CustomNodeType = Node<NodeData>;
