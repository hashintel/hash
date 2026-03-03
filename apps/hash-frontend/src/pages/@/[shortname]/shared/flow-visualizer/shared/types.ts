import type {
  ActionDefinition,
  ActionStepDefinition,
  ActionStepWithParallelInput,
  FlowActionDefinitionId,
  ParallelGroupStepDefinition,
  ProgressLogBase,
  ProposedEntity,
  StepDefinition,
  StepGroup,
  StepProgressLog,
} from "@local/hash-isomorphic-utils/flows/types";
import type { Edge, Node } from "reactflow";

import type { SimpleStatus } from "../../../../../shared/flow-runs-context";

export type NodeData = {
  kind: StepDefinition["kind"];
  groupId?: number;
  actionDefinition?: ActionDefinition<FlowActionDefinitionId> | null;
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

export type StateChangeLog = ProgressLogBase & {
  message: string;
  type: "StateChange";
};

export type LogDisplay = "grouped" | "stream";

type CommonLogFields = {
  level: number;
};

export type StandaloneLog = (StepProgressLog | StateChangeLog) &
  CommonLogFields;

export type LogThread = {
  label: string;
  type: "Thread";
  recordedAt: string;
  threadWorkerId: string;
  threadStartedAt: string;
  threadClosedAt?: string;
  closedDueToFlowClosure?: boolean;
  logs: LocalProgressLog[];
} & CommonLogFields;

export type LocalProgressLog = StandaloneLog | LogThread;

export type ProposedEntityOutput = Omit<ProposedEntity, "provenance"> & {
  researchOngoing: boolean;
};
