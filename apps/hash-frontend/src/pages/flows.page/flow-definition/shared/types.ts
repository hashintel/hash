import type {
  ActionDefinition,
  ActionStepDefinition,
  ActionStepWithParallelInput,
  ParallelGroupStepDefinition,
  StepDefinition,
} from "@local/hash-isomorphic-utils/flows/types";
import type { Node } from "reactflow";

export type NodeData = {
  kind: StepDefinition["kind"];
  groupId?: number;
  actionDefinition?: ActionDefinition | null;
  label: string;
  inputSources:
    | ActionStepDefinition["inputSources"]
    | ActionStepWithParallelInput["inputSources"]
    | ParallelGroupStepDefinition["inputSourceToParallelizeOn"][];
};

export type CustomNodeType = Node<NodeData>;
