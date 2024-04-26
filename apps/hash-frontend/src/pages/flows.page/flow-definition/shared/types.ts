import type {
  ActionDefinition,
  ActionStepDefinition,
  ActionStepWithParallelInput,
  ParallelGroupStepDefinition,
  StepDefinition,
  StepGroup,
} from "@local/hash-isomorphic-utils/flows/types";
import type { Edge, Node } from "reactflow";

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

export type GroupWithEdgesAndNodes = {
  group: StepGroup;
  edges: Edge[];
  nodes: CustomNodeType[];
};

export type GroupsByGroupId =
  | Record<number, GroupWithEdgesAndNodes>
  | { 0: { edges: Edge[]; group: null; nodes: CustomNodeType[] } };
