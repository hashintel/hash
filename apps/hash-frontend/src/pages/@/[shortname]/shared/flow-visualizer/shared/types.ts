import type {
  ProgressLogBase,
  ProposedEntity,
  StepDefinition,
  StepProgressLog,
} from "@local/hash-isomorphic-utils/flows/types";

/** A step of a flow, including one inside a `forEach`, for the run sidebar's list of steps. */
export type FlowStepSummary = {
  stepId: string;
  /** The `forEach` step it's inside, if any. */
  parentStepId?: string;
  kind: StepDefinition["kind"];
  label: string;
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
