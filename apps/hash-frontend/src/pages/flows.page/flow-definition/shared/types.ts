import type {
  ActionDefinition,
  ParallelGroupStepDefinition,
  TriggerDefinition,
} from "@local/hash-isomorphic-utils/flows/types";
import type { Node } from "reactflow";
import { ActionStepDefinition } from "@local/hash-isomorphic-utils/flows/types";

type DeepReadOnly<T> = {
  readonly [key in keyof T]: DeepReadOnly<T[key]>;
};

export type NodeData = {
  stepDefinition: DeepReadOnly<ActionDefinition | TriggerDefinition> | null;
  label: string;
  inputSources:
    | ActionStepDefinition["inputSources"]
    | ParallelGroupStepDefinition["inputSourceToParallelizeOn"][]
    | ParallelGroupStepDefinition["steps"][number]["inputSources"];
};

export type CustomNodeType = Node<NodeData>;
