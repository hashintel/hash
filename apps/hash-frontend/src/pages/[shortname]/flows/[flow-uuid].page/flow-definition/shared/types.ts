import type {
  ActionDefinition,
  ActionStepDefinition,
  ActionStepWithParallelInput,
  ParallelGroupStepDefinition,
  StepDefinition,
  StepGroup,
} from "@local/hash-isomorphic-utils/flows/types";
import type { Edge, Node } from "reactflow";

import type { SimpleStatus } from "../../../../../shared/flow-runs-context";

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

export type EdgeData = { sourceStatus: SimpleStatus };

export type CustomEdgeType = Edge<EdgeData>;

export type EdgesAndNodes = {
  edges: CustomEdgeType[];
  nodes: CustomNodeType[];
};

export type GroupWithEdgesAndNodes = {
  group: StepGroup;
} & EdgesAndNodes;

export type MultiGroupFlow = {
  type: "grouped";
  groups: GroupWithEdgesAndNodes[];
};

export type UngroupedEdgesAndNodes = {
  group: null;
} & EdgesAndNodes;

export type SingleGroupFlow = {
  type: "ungrouped";
  groups: [UngroupedEdgesAndNodes];
};

export type FlowMaybeGrouped = SingleGroupFlow | MultiGroupFlow;
