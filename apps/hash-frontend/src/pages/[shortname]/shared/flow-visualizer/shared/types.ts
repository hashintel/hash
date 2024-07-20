import type { Edge, Node } from "reactflow";
import type {
  ActionDefinition,
  ActionStepDefinition,
  ActionStepWithParallelInput,
  ParallelGroupStepDefinition,
  ProgressLogBase,
  ProposedEntity,
  StepDefinition,
  StepGroup,
  StepProgressLog,
} from "@local/hash-isomorphic-utils/flows/types";

import type { SimpleStatus } from "../../../../shared/flow-runs-context";

export interface NodeData {
  kind: StepDefinition["kind"];
  groupId?: number;
  actionDefinition?: ActionDefinition | null;
  label: string;
  inputSources:
    | ActionStepDefinition["inputSources"]
    | ActionStepWithParallelInput["inputSources"]
    | ParallelGroupStepDefinition["inputSourceToParallelizeOn"][];
}

export type CustomNodeType = Node<NodeData>;

export interface EdgeData {
  sourceStatus: SimpleStatus;
}

export type CustomEdgeType = Edge<EdgeData>;

export interface EdgesAndNodes {
  edges: CustomEdgeType[];
  nodes: CustomNodeType[];
}

export type GroupWithEdgesAndNodes = {
  group: StepGroup;
} & EdgesAndNodes;

export interface MultiGroupFlow {
  type: "grouped";
  groups: GroupWithEdgesAndNodes[];
}

export type UngroupedEdgesAndNodes = {
  group: null;
} & EdgesAndNodes;

export interface SingleGroupFlow {
  type: "ungrouped";
  groups: [UngroupedEdgesAndNodes];
}

export type FlowMaybeGrouped = SingleGroupFlow | MultiGroupFlow;

export type StateChangeLog = ProgressLogBase & {
  message: string;
  type: "StateChange";
};

export type LocalProgressLog = StepProgressLog | StateChangeLog;

export type ProposedEntityOutput = Omit<
  ProposedEntity,
  "provenance" | "propertyMetadata"
> & {
  researchOngoing: boolean;
};
