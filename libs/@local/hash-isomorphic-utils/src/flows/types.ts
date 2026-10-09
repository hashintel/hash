import type { FlowRun } from "../graphql/api-types.gen.js";
import type { ActorTypeDataType } from "../system-types/google/googlesheetsfile.js";
import type {
  AiFlowActionDefinitionId,
  IntegrationFlowActionDefinitionId,
} from "./action-definitions.js";
import type {
  ActorEntityUuid,
  EntityId,
  EntityUuid,
  PropertyObject,
  PropertyObjectMetadata,
  ProvidedEntityEditionProvenance,
  Url,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { DistributiveOmit } from "@local/advanced-types/distribute";
import type { Status } from "@local/status";

export const flowRunsQueryMaxLimit = 100;

export type FlowActionDefinitionId =
  | AiFlowActionDefinitionId
  | IntegrationFlowActionDefinitionId;

export type DeepReadOnly<T> = {
  readonly [key in keyof T]: DeepReadOnly<T[key]>;
};

export type WebPage = {
  url: Url;
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
  provenance: ProvidedEntityEditionProvenance;
  propertyMetadata: PropertyObjectMetadata;
  localEntityId: EntityId;
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]];
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

export type PersistedEntityMetadata = {
  entityId: EntityId;
  operation: "create" | "update" | "already-exists-as-proposed";
};

export type FailedEntityProposal = {
  existingEntityId?: EntityId;
  operation?: "create" | "update" | "already-exists-as-proposed";
  proposedEntity: ProposedEntityWithResolvedLinks;
  message: string;
};

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
  Date: string; // e.g. "2025-01-01"
  EntityId: EntityId;
  FailedEntityProposal: FailedEntityProposal;
  FormattedText: FormattedText;
  GoogleAccountId: string;
  GoogleSheet: GoogleSheet;
  Number: number;
  PersistedEntityMetadata: PersistedEntityMetadata;
  ProposedEntity: ProposedEntity;
  ProposedEntityWithResolvedLinks: ProposedEntityWithResolvedLinks;
  Text: string;
  VersionedUrl: VersionedUrl;
  WebPage: WebPage;
  WebSearchResult: WebSearchResult;
};

export type PayloadKind = keyof PayloadKindValues;

/**
 * Payload kinds whose values are always stored in S3, whether singular or an array, due to their potential size.
 */
export const storedPayloadKinds = [
  "FailedEntityProposal",
  "ProposedEntity",
  "ProposedEntityWithResolvedLinks",
] as const;

export type StoredPayloadKind = (typeof storedPayloadKinds)[number];

/**
 * Payload kinds whose singular values are small enough to pass inline, but whose arrays are stored in S3,
 * because they can grow without bound.
 */
export const storedArrayPayloadKinds = ["PersistedEntityMetadata"] as const;

export type StoredArrayPayloadKind = (typeof storedArrayPayloadKinds)[number];

/**
 * Payload kinds that can appear in a stored payload reference.
 */
export type StorablePayloadKind = StoredPayloadKind | StoredArrayPayloadKind;

/**
 * A payload written to S3 as one object.
 *
 * @template K - The payload kind being stored
 * @template IsArray - Whether the stored value is an array of K values
 */
export type StoredObjectRef<
  K extends StorablePayloadKind = StorablePayloadKind,
  IsArray extends boolean = boolean,
> = {
  /** Discriminator to identify this as a stored reference */
  __stored: true;
  /** The payload kind being stored - for type checking */
  kind: K;
  /** S3 storage key */
  storageKey: string;
  /** Whether the stored value is an array */
  array: IsArray;
} & (IsArray extends true
  ? {
      /** The number of items in the stored array, so that it can be iterated over without fetching it. */
      length: number;
    }
  : unknown);

/**
 * One item of a stored array, e.g. the item a branch of a for-each step runs for.
 *
 * It points at the stored object that holds the item, never at a concatenation, so that it stays small and
 * resolving it downloads one object.
 */
export type StoredItemRef<K extends StorablePayloadKind = StorablePayloadKind> =
  {
    __stored: true;
    kind: K;
    array: false;
    of: StoredObjectRef<K, true>;
    index: number;
  };

/**
 * Several stored arrays concatenated, e.g. the arrays collected from each branch of a for-each step.
 */
export type StoredConcatRef<
  K extends StorablePayloadKind = StorablePayloadKind,
> = {
  __stored: true;
  kind: K;
  array: true;
  parts: StoredArrayRef<K>[];
  length: number;
};

/**
 * A stored payload reference to a singular value.
 */
export type SingularStoredPayloadRef<
  K extends StorablePayloadKind = StorablePayloadKind,
> = StoredObjectRef<K, false> | StoredItemRef<K>;

/**
 * A stored payload reference to an array of values.
 */
export type ArrayStoredPayloadRef<
  K extends StorablePayloadKind = StorablePayloadKind,
> = StoredObjectRef<K, true> | StoredConcatRef<K>;

type StoredArrayRef<K extends StorablePayloadKind> = ArrayStoredPayloadRef<K>;

/**
 * A reference to a payload that has been stored in S3, used to avoid passing large payloads through Temporal.
 *
 * Only activities resolve references (see `payload-storage.ts` in `@local/hash-backend-utils`): workflow code
 * handles them using their metadata alone, e.g. an array's `length`, or an item's index.
 */
export type StoredPayloadRef<
  K extends StorablePayloadKind = StorablePayloadKind,
  IsArray extends boolean = boolean,
> = IsArray extends true
  ? ArrayStoredPayloadRef<K>
  : SingularStoredPayloadRef<K>;

/** Type guard to check if a value is a stored payload reference */
export const isStoredPayloadRef = (
  value: unknown,
): value is StoredPayloadRef => {
  return (
    typeof value === "object" &&
    value !== null &&
    "__stored" in value &&
    value.__stored === true
  );
};

/** Type guard to check if a stored payload ref is for an array */
export const isArrayStoredPayloadRef = <K extends StorablePayloadKind>(
  ref: StoredPayloadRef<K>,
): ref is ArrayStoredPayloadRef<K> => ref.array;

/** Type guard to check if a stored payload ref is for a singular value */
export const isSingularStoredPayloadRef = <K extends StorablePayloadKind>(
  ref: StoredPayloadRef<K>,
): ref is SingularStoredPayloadRef<K> => !ref.array;

/**
 * Payload value type used in activity outputs and inputs.
 *
 * - For a {@link StoredPayloadKind}, the value is always a stored reference.
 * - For a {@link StoredArrayPayloadKind}, an array is a stored reference, and a singular value is inline or, as
 *   an item of a stored array, a reference to that item.
 * - For other kinds, the value is the actual payload value (or array of values).
 *
 * An array a flow wrapped from a singular value holds that value, so it may also be a one-item array holding
 * an item reference.
 */
export type PayloadValue<
  K extends PayloadKind,
  IsArray extends boolean,
> = K extends StoredPayloadKind
  ? StoredPayloadRef<K, IsArray>
  : K extends StoredArrayPayloadKind
    ? IsArray extends true
      ? ArrayStoredPayloadRef<K> | (PayloadKindValues[K] | StoredItemRef<K>)[]
      : PayloadKindValues[K] | StoredItemRef<K>
    : IsArray extends true
      ? PayloadKindValues[K][]
      : PayloadKindValues[K];

/**
 * Singular payload types for all payload kinds.
 */
export type SingularPayload = {
  [K in keyof PayloadKindValues]: { kind: K; value: PayloadValue<K, false> };
}[keyof PayloadKindValues];

/**
 * Array payload types for all payload kinds.
 */
export type ArrayPayload = {
  [K in keyof PayloadKindValues]: { kind: K; value: PayloadValue<K, true> };
}[keyof PayloadKindValues];

/**
 * General payload type used throughout the flow system. For stored kinds, the value may be a stored reference
 * that activities resolve.
 */
export type Payload = SingularPayload | ArrayPayload;

/**
 * Resolved payload types - used after stored refs have been resolved (e.g., in GraphQL responses).
 * These contain actual values instead of StoredPayloadRef for stored payload kinds.
 */
export type ResolvedSingularPayload = {
  [K in keyof PayloadKindValues]: {
    kind: K;
    value: PayloadKindValues[K];
  };
}[keyof PayloadKindValues];

export type ResolvedArrayPayload = {
  [K in keyof PayloadKindValues]: {
    kind: K;
    value: PayloadKindValues[K][];
  };
}[keyof PayloadKindValues];

/**
 * Payload type after stored refs have been resolved.
 * Used in frontend/GraphQL contexts where the backend has already resolved StoredPayloadRefs.
 */
export type ResolvedPayload = ResolvedSingularPayload | ResolvedArrayPayload;

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

export type ActionDefinition<
  ActionDefinitionId extends FlowActionDefinitionId,
> = {
  kind: "action";
  actionDefinitionId: ActionDefinitionId;
  name: string;
  description: string;
  inputs: InputDefinition[];
  outputs: OutputDefinition[];
};

/**
 * Whether a connection leaves the value available to other consumers (`read`) or takes it (`consume`). Unset
 * means the default for the input it feeds.
 */
export type ValueAccess = "read" | "consume";

type ConnectionOptions = {
  access?: ValueAccess;
  /** Explicitly wraps a singular value into a one-item array, to feed an array input. */
  wrap?: true;
  /**
   * Allows a value that may be missing to feed a required input: when it is missing, the consuming step, and
   * everything that depends on it, is skipped rather than failed.
   */
  whenMissing?: "skip";
};

/**
 * A fixed value. `value` is an array when the payload is an array.
 */
export type ConstantPayload = {
  kind: PayloadKind;
  value: unknown;
};

/**
 * Where a step input's value comes from.
 */
export type StepInputSource =
  | ({ kind: "flow-input"; inputName: string } & ConnectionOptions)
  | ({
      kind: "step-output";
      stepId: string;
      outputName: string;
    } & ConnectionOptions)
  /** The current item of the nearest enclosing for-each step. */
  | ({ kind: "item" } & ConnectionOptions)
  /** A fixed value, the same in every run. */
  | { kind: "constant"; payload: ConstantPayload };

export type ActionStepDefinition<
  ActionDefinitionId extends string = FlowActionDefinitionId,
> = {
  kind: "action";
  stepId: string;
  /**
   * The id of an action definition. A definition from outside the codebase may name an action that doesn't
   * exist: `validateFlowDefinition` reports it.
   */
  actionDefinitionId: ActionDefinitionId;
  description: string;
  /** The source of each of the action's inputs that is connected, by input name. */
  inputs: Record<string, StepInputSource>;
  retryCount?: number;
};

/**
 * A step which runs its nested steps once per item of an array, in parallel, and collects one output from
 * every item.
 *
 * e.g. for each input entity, do X with that entity in a separate branch.
 */
export type ForEachStepDefinition<
  ActionDefinitionId extends string = FlowActionDefinitionId,
> = {
  kind: "for-each";
  stepId: string;
  description: string;
  /** The array whose items each run the nested steps once. */
  over: StepInputSource;
  steps: StepDefinition<ActionDefinitionId>[];
  /**
   * The output of a nested step, collected from every item into an array: singular outputs are gathered, and
   * array outputs concatenated. It must always be present, and it is the step's only output, called `as`.
   */
  collect: { stepId: string; outputName: string; as: string };
};

export type StepDefinition<
  ActionDefinitionId extends string = FlowActionDefinitionId,
> =
  | ActionStepDefinition<ActionDefinitionId>
  | ForEachStepDefinition<ActionDefinitionId>;

/**
 * An input to a flow, which whatever starts a run supplies.
 */
export type FlowInputDefinition = {
  name: string;
  payloadKind: PayloadKind;
  array: boolean;
  required: boolean;
  /** How the input is presented to people, e.g. as a run form field. Defaults to its name. */
  label?: string;
  description?: string;
};

/**
 * A step output exposed as one of the flow's outputs.
 */
export type FlowOutputDefinition = {
  name: string;
  stepId: string;
  outputName: string;
  description?: string;
};

/**
 * What a flow does: its inputs, the steps that connect them, and its outputs. It is what a `Flow Definition`
 * entity holds, and has no id: the entity's uuid identifies it. It says nothing about how a flow
 * is started – triggers are separate – or which worker runs it, which follows from its actions (see
 * `getFlowType`).
 *
 * In-repo flows are written with the typed builder in `define-flow.ts`. Definitions from anywhere else (a GUI,
 * YAML, the graph) are checked with `validateFlowDefinition` before use.
 */
export type FlowDefinition<
  ActionDefinitionId extends string = FlowActionDefinitionId,
> = {
  name: string;
  description: string;
  inputs: FlowInputDefinition[];
  /** In any order: the validator checks for dangling references and cycles. */
  steps: StepDefinition<ActionDefinitionId>[];
  outputs: FlowOutputDefinition[];
};

/**
 * A flow definition with the uuid of its `Flow Definition` entity, as for the flows defined in code.
 */
export type FlowDefinitionWithId<
  ActionDefinitionId extends string = FlowActionDefinitionId,
> = {
  flowDefinitionId: EntityUuid;
  flowDefinition: FlowDefinition<ActionDefinitionId>;
};

/**
 * The values given to a flow's inputs, by input name. An input that isn't given has no key.
 */
export type FlowInputValues = Record<string, Payload>;

export type StepInput<P extends Payload = Payload> = {
  inputName: string;
  payload: P;
};

export type StepOutput<P extends Payload = Payload> = {
  outputName: string;
  payload: P;
};

/**
 * StepOutput with resolved payload - used in frontend/GraphQL contexts
 * where stored refs have been resolved by the backend.
 */
export type ResolvedStepOutput = {
  outputName: string;
  payload: ResolvedPayload;
};

export type StepRunOutput = Status<
  Required<Pick<ActionStep<FlowActionDefinitionId>, "outputs">>
>;

/**
 * StepRunOutput with resolved payloads - used in frontend/GraphQL contexts.
 */
export type ResolvedStepRunOutput = Status<{
  outputs: ResolvedStepOutput[];
}>;

export type ActionStep<
  ActionDefinitionId extends FlowActionDefinitionId = FlowActionDefinitionId,
> = {
  stepId: string;
  kind: "action";
  actionDefinitionId: ActionDefinitionId;
  retries?: number;
  inputs?: StepInput[];
  outputs?: StepOutput[];
};

export type ForEachStep<
  ActionDefinitionId extends FlowActionDefinitionId = FlowActionDefinitionId,
> = {
  stepId: string;
  kind: "for-each";
  /** The array the step runs its nested steps for, once it is available. */
  over?: ArrayPayload;
  steps?: FlowStep<ActionDefinitionId>[];
  /**
   * The value each branch has contributed so far, keyed by its item's index: `null` for a branch whose collected
   * step was skipped, which contributes nothing.
   */
  branchValues?: Record<number, unknown>;
  /** The values collected from every branch, in item order. Set once every branch has contributed. */
  collected?: StepOutput<ArrayPayload>;
};

export type FlowStep<
  ActionDefinitionId extends FlowActionDefinitionId = FlowActionDefinitionId,
> = ActionStep<ActionDefinitionId> | ForEachStep<ActionDefinitionId>;

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
export type LocalFlowRun<
  ActionDefinitionId extends FlowActionDefinitionId = FlowActionDefinitionId,
> = {
  name: string;
  temporalWorkflowId: string;
  flowInputs: FlowInputValues;
  flowDefinitionId: EntityUuid;
  steps: FlowStep<ActionDefinitionId>[];
  outputs?: StepOutput[];
};

export type ProgressLogBase = {
  recordedAt: string;
  stepId: string;
};

export type WorkerType =
  | "Coordinator"
  | "Sub-coordinator"
  | "Link explorer"
  | "Document analyzer";

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
  persistedEntityMetadata: PersistedEntityMetadata;
  type: "PersistedEntityMetadata";
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

export type FlowSignalType =
  | "externalInputRequest"
  | "externalInputResponse"
  | "logProgress"
  | "researchActionCheckpoint"
  | "stopWorker";

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
    resolvedBy: ActorEntityUuid;
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
  resolvedBy?: ActorEntityUuid;
  /** The time at which the request was made */
  raisedAt: string;
};

export type FlowUsageRecordCustomMetadata = {
  taskName?: string;
  stepId?: string;
};

/**
 * A step the engine skipped because a value it needs is missing. A skipped step runs no activity, so the engine
 * records its skips in the run's Temporal memo, under `skippedSteps`.
 */
export type SkippedStep = {
  stepId: string;
  /** The step's action, or `forEach` for a for-each step. */
  stepType: string;
  skippedAt: string;
};

export const detailedFlowFields = [
  "failureMessage",
  "flowInputs",
  "dataSources",
  "inputRequests",
  "outputs",
  "steps",
] as const;

export type DetailedFlowField = (typeof detailedFlowFields)[number];

export type SparseFlowRun = Omit<FlowRun, DetailedFlowField>;
