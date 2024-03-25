import type {
  ActionDefinition,
  StepInputSource,
  TriggerDefinition,
} from "@local/hash-isomorphic-utils/flows/types";
import type { Node } from "reactflow";

export type NodeData = {
  stepDefinition: ActionDefinition | TriggerDefinition;
  label: string;
  inputSources: StepInputSource[];
};

export type CustomNode = Node<NodeData>;
