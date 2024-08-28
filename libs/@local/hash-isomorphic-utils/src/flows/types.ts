import type { VersionedUrl } from "@blockprotocol/type-system";
import type { DistributiveOmit } from "@local/advanced-types/distribute";
import type {
  EnforcedEntityEditionProvenance,
  SerializedEntity,
} from "@local/hash-graph-sdk/entity";
import type { AccountId } from "@local/hash-graph-types/account";
import type {
  EntityId,
  EntityUuid,
  PropertyMetadataObject,
  PropertyObject,
} from "@local/hash-graph-types/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import type { Status } from "@local/status";

import type { FlowRun } from "../graphql/api-types.gen.js";
import type { ActorTypeDataType } from "../system-types/google/googlesheetsfile.js";
import type { ActionDefinitionId } from "./action-definitions.js";
import type { TriggerDefinitionId } from "./trigger-definitions.js";

export type DeepReadOnly<T> = {
  readonly [key in keyof T]: DeepReadOnly<T[key]>;
};

export type WebPage = {
  url: string;
  title: string;
  htmlContent: string;
  innerText: string;
};

export type LocalOrExistingEntityId =
  | { kind: "proposed-entity"; localId: EntityId }
  | { kind: "existing-entity"; entityId: EntityId };

/**
 * @todo H-3163: remove the ProposedEntity type inside infer-entities, by making the browser plugin flow
 *    use the same claim -> entity process as other flows
 */
export type ProposedEntity = {
  claims: {
    isSubjectOf: EntityId[];
    isObjectOf: EntityId[];
  };
  provenance: EnforcedEntityEditionProvenance;
  propertyMetadata: PropertyMetadataObject;
  localEntityId: EntityId;
  entityTypeId: VersionedUrl;
  summary?: string;
  properties: PropertyObject;
  sourceEntityId?: LocalOrExistingEntityId;
  targetEntityId?: LocalOrExistingEntityId;
};

export type ProposedEntityWithResolvedLinks = Omit<
  ProposedEntity,
  "sourceEntityLocalId" | "targetEntityLocalId"
> & {
  linkData?: {
    leftEntityId: EntityId;
    rightEntityId: EntityId;
  };
};

export type PersistedEntity = {
  entity?: SerializedEntity;
  existingEntity?: SerializedEntity;
  operation: "create" | "update" | "already-exists-as-proposed";
};

export type FailedEntityProposal = {
  existingEntity?: SerializedEntity;
  operation?: "create" | "update" | "already-exists-as-proposed";
  proposedEntity: ProposedEntityWithResolvedLinks;
  message: string;
};

export type PersistedEntities = {
  persistedEntities: PersistedEntity[];
  failedEntityProposals: FailedEntityProposal[];
};

export type FlowInputs = [
  {
    dataSources: FlowDataSources;
    flowDefinition: FlowDefinition;
    flowTrigger: FlowTrigger;
    webId: OwnedById;
  },
];

export const textFormats = ["CSV", "HTML", "Markdown", "Plain"] as const;

export type TextFormat = (typeof textFormats)[number];

export type FormattedText = {
  content: string;
  format: TextFormat;
};

export type GoogleSheet = { spreadsheetId: string } | { newSheetName: string };

export type WebSearchResult = Pick<WebPage, "title" | "url">;

export type PayloadKindValues = {
  ActorType: ActorTypeDataType;
  Boolean: boolean;
  Entity: SerializedEntity;
  EntityId: EntityId;
  FormattedText: FormattedText;
  GoogleAccountId: string;
  GoogleSheet: GoogleSheet;
  Number: number;
  PersistedEntities: PersistedEntities;
  PersistedEntity: PersistedEntity;
  ProposedEntity: ProposedEntity;
  ProposedEntityWithResolvedLinks: ProposedEntityWithResolvedLinks;
  Text: string;
  VersionedUrl: VersionedUrl;
  WebPage: WebPage;
  WebSearchResult: WebSearchResult;
};

export type PayloadKind = keyof PayloadKindValues;

export type SingularPayload = {
  [K in keyof PayloadKindValues]: {
    kind: K;
    value: PayloadKindValues[K];
  };
}[keyof PayloadKindValues];

export type ArrayPayload = {
  [K in keyof PayloadKindValues]: {
    kind: K;
    value: PayloadKindValues[K][];
  };
}[keyof PayloadKindValues];

export type Payload = SingularPayload | ArrayPayload;

/**
 * Step Definition
 */

export type InputDefinition = {
  name: string;
  description?: string;
  oneOfPayloadKinds: PayloadKind[];
  array: boolean;
  required: boolean;
  default?: Payload;
};

export type OutputDefinition<
  A extends boolean = boolean,
  K extends PayloadKind = PayloadKind,
> = {
  name: string;
  description?: string;
  payloadKind: K;
  array: A;
  required: boolean;
};

export type TriggerDefinition = {
  kind: "trigger";
  triggerDefinitionId: TriggerDefinitionId;
  name: string;
  outputs?: OutputDefinition[];
};

export type ActionDefinition = {
  kind: "action";
  actionDefinitionId: ActionDefinitionId;
  name: string;
  description: string;
  inputs: InputDefinition[];
  outputs: OutputDefinition[];
};

/**
 * Flow Definition
 */

export type StepInputSource<P extends Payload = Payload> = {
  inputName: string;
} & (
  | {
      /**
       * This refers to an output from a previous step, and can also refer
       * to outputs from the `trigger` by specifying `sourceStepId: "trigger"`.
       */
      kind: "step-output";
      sourceStepId: string;
      sourceStepOutputName: string;
      fallbackPayload?: P;
    }
  | {
      /**
       * A hardcoded value in the flow definition, which is constant
       * for all flow runs.
       */
      kind: "hardcoded";
      payload: P;
    }
);

export type ActionStepDefinition<
  AdditionalInputSources extends { inputName: string } | null = null,
> = {
  kind: "action";
  stepId: string;
  groupId?: number;
  actionDefinitionId: ActionDefinitionId;
  description: string;
  inputSources: AdditionalInputSources extends null
    ? StepInputSource[]
    : (StepInputSource | AdditionalInputSources)[];
  retryCount?: number;
};

export type ActionStepWithParallelInput = ActionStepDefinition<{
  /**
   * This additional input source refers to the dispersed input
   * for a parallel group.
   */
  inputName: string;
  kind: "parallel-group-input";
}>;

export type StepDefinition =
  | ActionStepDefinition
  | ActionStepWithParallelInput
  | ParallelGroupStepDefinition;

/**
 * A step which spawns multiple parallel branches of steps based on an array input.
 *
 * e.g. for each input entity, do X with that entity in a separate branch.
 */
export type ParallelGroupStepDefinition = {
  kind: "parallel-group";
  stepId: string;
  groupId?: number;
  description: string;
  /**
   * The input source to parallelize on must expect an `ArrayPayload`,
   * so that each item in the array can be processed by the steps in
   * parallel.
   */
  inputSourceToParallelizeOn: StepInputSource<ArrayPayload>;
  /**
   * The steps that will be executed in parallel branches for each payload
   * item in the provided `ArrayPayload`.
   */
  steps: StepDefinition[];
  /**
   * The aggregate output of the parallel group must be defined
   * as an `array` output.
   */
  aggregateOutput: OutputDefinition<true> & {
    /**
     * The step ID for the step in the parallel group that will produce the
     * _singular_ output that will ber aggregated in an array as the
     * output for the parallel group.
     */
    stepId: string;
    /**
     * The name of the output that will be aggregated in an array from the individual outputs of each parallelized step.
     */
    stepOutputName: string;
  };
};

type FlowDefinitionTrigger =
  | {
      kind: "trigger";
      description: string;
      triggerDefinitionId: Exclude<TriggerDefinitionId, "scheduledTrigger">;
      outputs?: OutputDefinition[];
    }
  | {
      kind: "scheduled";
      description: string;
      triggerDefinitionId: "scheduledTrigger";
      active: boolean;
      cronSchedule: string;
      outputs?: OutputDefinition[];
    };

export type StepGroup = {
  groupId: number;
  description: string;
};

export type FlowDefinition = {
  name: string;
  description: string;
  flowDefinitionId: EntityUuid;
  trigger: FlowDefinitionTrigger;
  groups?: StepGroup[];
  steps: StepDefinition[];
  outputs: (OutputDefinition & {
    /**
     * The step ID for the step in the flow that will produce the
     * output.
     */
    stepId: string;
    /**
     * The name of the output in the step
     */
    stepOutputName: string;
  })[];
};

export type StepInput<P extends Payload = Payload> = {
  inputName: string;
  payload: P;
};

export type StepOutput<P extends Payload = Payload> = {
  outputName: string;
  payload: P;
};

export type StepRunOutput = Status<Required<Pick<ActionStep, "outputs">>>;

export type ActionStep = {
  stepId: string;
  kind: "action";
  actionDefinitionId: ActionDefinitionId;
  retries?: number;
  inputs?: StepInput[];
  outputs?: StepOutput[];
};

export type ParallelGroupStep = {
  stepId: string;
  kind: "parallel-group";
  inputToParallelizeOn?: StepInput<ArrayPayload>;
  steps?: FlowStep[];
  aggregateOutput?: StepOutput<ArrayPayload>;
};

export type FlowStep = ActionStep | ParallelGroupStep;

export type FlowTrigger = {
  triggerDefinitionId: TriggerDefinitionId;
  outputs?: StepOutput[];
};

export type FlowInternetAccessSettings = {
  enabled: boolean;
  browserPlugin: {
    enabled: boolean;
    domains: string[];
  };
};

export type FlowDataSources = {
  /**
   * Any files the user decides to include in the flow's context
   */
  files: { fileEntityIds: EntityId[] };
  /**
   * Whether agents in the flow have access to the external internet, e.g. for web searches and for visiting URLs
   */
  internetAccess: FlowInternetAccessSettings;
};

/**
 * A simplified type for a FlowRun used internally in the worker logic.
 */
export type LocalFlowRun = {
  name: string;
  flowRunId: EntityUuid;
  trigger: FlowTrigger;
  flowDefinitionId: EntityUuid;
  steps: FlowStep[];
  outputs?: StepOutput[];
};

export type ProgressLogBase = {
  recordedAt: string;
  stepId: string;
};

export type WorkerType = "Coordinator" | "Sub-coordinator" | "Link explorer";

/**
 * Identifiers for a 'worker' within the flow, which corresponds to an agent.
 *
 * Note that this is separate from the Temporal worker – the 'worker' here is a HASH concept for a specific research agent.
 */
export type WorkerIdentifiers = {
  workerType: WorkerType;
  /**
   * HASH-generated id for the worker
   */
  workerInstanceId: string;
  /**
   * HASH-generated workerInstanceId of the worker that created this one, if any.
   */
  parentInstanceId: string | null;
  /**
   * The identifier a parent worker used when creating this worker in a tool call, if any
   */
  toolCallId: string | null;
};

export type WorkerProgressLogBase = ProgressLogBase & WorkerIdentifiers;

/**
 * When a worker (agent) decides to stop a worker it has created, this log is created.
 */
export type WorkerWasStoppedLog = WorkerProgressLogBase & {
  explanation: string;
  type: "WorkerWasStopped";
};

/**
 * An internet search query is made.
 */
export type QueriedWebLog = WorkerProgressLogBase & {
  explanation: string;
  query: string;
  type: "QueriedWeb";
};

/**
 * An agent created a plan
 */
export type CreatedPlanLog = WorkerProgressLogBase & {
  plan: string;
  type: "CreatedPlan";
};

/**
 * An agent updated a plan
 */
export type UpdatedPlanLog = WorkerProgressLogBase & {
  plan: string;
  type: "UpdatedPlan";
};

/**
 * An agent visited a web page (e.g. to infer claims from it)
 */
export type VisitedWebPageLog = WorkerProgressLogBase & {
  explanation: string;
  webPage: Pick<WebPage, "url" | "title">;
  type: "VisitedWebPage";
};

type StartedCoordinatorLog = WorkerProgressLogBase & {
  attempt: number;
  input: {
    goal: string;
  };
  type: "StartedCoordinator";
};

export type ClosedCoordinatorLog = WorkerProgressLogBase & {
  errorMessage?: string;
  output: {
    entityCount: number;
  };
  type: "ClosedCoordinator";
};

export type StartedSubCoordinatorLog = WorkerProgressLogBase & {
  explanation: string;
  input: {
    goal: string;
    entityTypeTitles: string[];
  };
  type: "StartedSubCoordinator";
};

export type CoordinatorWaitsForTasksLog = WorkerProgressLogBase & {
  explanation: string;
  type: "CoordinatorWaitsForTasks";
};

export type ClosedSubCoordinatorLog = WorkerProgressLogBase & {
  errorMessage?: string;
  explanation: string;
  goal: string;
  output: {
    claimCount: number;
    entityCount: number;
  };
  type: "ClosedSubCoordinator";
};

export type StartedLinkExplorerTaskLog = WorkerProgressLogBase & {
  explanation: string;
  input: {
    goal: string;
    initialUrl: string;
  };
  type: "StartedLinkExplorerTask";
};

export type ClosedLinkExplorerTaskLog = WorkerProgressLogBase & {
  errorMessage?: string;
  goal: string;
  output: {
    claimCount: number;
    entityCount: number;
    resourcesExploredCount: number;
    suggestionForNextSteps: string;
  };
  type: "ClosedLinkExplorerTask";
};

export type InferredClaimsFromTextLog = WorkerProgressLogBase & {
  output: {
    claimCount: number;
    entityCount: number;
    resource: {
      title?: string;
      url: string;
    };
  };
  type: "InferredClaimsFromText";
};

export type ViewedFile = WorkerProgressLogBase & {
  explanation: string;
  file: Pick<WebPage, "url" | "title">;
  recordedAt: string;
  stepId: string;
  type: "ViewedFile";
};

export type ProposedEntityLog = WorkerProgressLogBase & {
  proposedEntity: Omit<ProposedEntity, "provenance">;
  isUpdateToExistingProposal: boolean;
  type: "ProposedEntity";
};

export type PersistedEntityLog = ProgressLogBase & {
  persistedEntity: PersistedEntity;
  type: "PersistedEntity";
};

export type ActivityFailedLog = ProgressLogBase & {
  message: string;
  retrying: boolean;
  type: "ActivityFailed";
};

/**
 * The flow was reset to a previous checkpoint
 */
export type ResetToCheckpointLog = ProgressLogBase & {
  type: "ResetToCheckpoint";
};

/**
 * A checkpoint was created
 */
export type CheckpointLog = ProgressLogBase & {
  type: "ResearchActionCheckpoint";
  checkpointId: string;
  eventId: number;
};

export type StepProgressLog =
  | ActivityFailedLog
  | CheckpointLog
  | ClosedCoordinatorLog
  | ClosedLinkExplorerTaskLog
  | ClosedSubCoordinatorLog
  | CoordinatorWaitsForTasksLog
  | CreatedPlanLog
  | InferredClaimsFromTextLog
  | PersistedEntityLog
  | ProposedEntityLog
  | QueriedWebLog
  | ResetToCheckpointLog
  | StartedCoordinatorLog
  | StartedLinkExplorerTaskLog
  | StartedSubCoordinatorLog
  | WorkerWasStoppedLog
  | UpdatedPlanLog
  | ViewedFile
  | VisitedWebPageLog;

const flowSignalTypes = [
  "externalInputRequest",
  "externalInputResponse",
  "logProgress",
  "researchActionCheckpoint",
  "stopWorker",
] as const;

export type FlowSignalType = (typeof flowSignalTypes)[number];

export type ProgressLogSignal = {
  attempt: number;
  logs: StepProgressLog[];
};

type ExternalInputRequestType = "human-input" | "get-urls-html-content";

type ExternalInputRequestDataByType = {
  "human-input": {
    questions: string[];
  };
  "get-urls-html-content": {
    urls: string[];
  };
};

export type ExternalInputRequestSignal<
  RequestType extends ExternalInputRequestType = ExternalInputRequestType,
> = {
  [Type in RequestType]: {
    requestId: string;
    stepId: string;
    type: Type;
    data: ExternalInputRequestDataByType[Type];
  };
}[RequestType];

export type ExternalInputResponseByType = {
  "human-input": {
    answers: string[];
  };
  "get-urls-html-content": {
    webPages: WebPage[];
  };
};

export type ExternalInputResponseSignal<
  RequestType extends ExternalInputRequestType = ExternalInputRequestType,
> = {
  [Type in RequestType]: {
    resolvedBy: AccountId;
    requestId: string;
    type: Type;
    data: ExternalInputResponseByType[Type];
  };
}[RequestType];

export type ExternalInputResponseWithoutUser = DistributiveOmit<
  ExternalInputResponseSignal,
  "resolvedBy"
>;

export type ExternalInputRequest<
  RequestType extends ExternalInputRequestType = ExternalInputRequestType,
> = ExternalInputRequestSignal<RequestType> & {
  /** The answers given by the human, if it was a request for human input */
  answers?: string[];
  /** The time at which the request was resolved */
  resolvedAt?: string;
  /** The user that responded to the request (or the user whose device responded to the request) */
  resolvedBy?: AccountId;
  /** The time at which the request was made */
  raisedAt: string;
};

export type FlowUsageRecordCustomMetadata = {
  taskName?: string;
  stepId?: string;
};

export const detailedFlowFields = [
  "failureMessage",
  "inputs",
  "inputRequests",
  "outputs",
  "steps",
] as const;

export type DetailedFlowField = (typeof detailedFlowFields)[number];

export type SparseFlowRun = Omit<FlowRun, DetailedFlowField>;
