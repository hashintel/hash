import type { SimpleStatus } from "../../../../../shared/flow-runs-context";
import type { NamedStepInputSource } from "./named-input-sources";
import type {
  ActionDefinition,
  FlowActionDefinitionId,
  ProgressLogBase,
  ProposedEntity,
  StepDefinition,
  StepProgressLog,
} from "@local/hash-isomorphic-utils/flows/types";
import type { Edge, Node } from "reactflow";

export type NodeData = {
  kind: StepDefinition["kind"];
  actionDefinition?: ActionDefinition<FlowActionDefinitionId> | null;
  label: string;
  inputSources: NamedStepInputSource[];
};

export type CustomNodeType = Node<NodeData>;

export type EdgeData = { sourceStatus: SimpleStatus };

export type CustomEdgeType = Edge<EdgeData>;

export type EdgesAndNodes = {
  edges: CustomEdgeType[];
  nodes: CustomNodeType[];
};

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
