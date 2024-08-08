import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import type { DistributiveOmit } from "@local/advanced-types/distribute";
import type { SerializedEntity } from "@local/hash-graph-sdk/entity";
import type { Property } from "@local/hash-graph-types/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import type { Status } from "@local/status";
import type { QueryDefinition } from "@temporalio/workflow";

import type {
  AutomaticInferenceArguments,
  ManualInferenceArguments,
} from "./flows/browser-plugin-flow-types.js";
import type {
  ExternalInputRequestSignal,
  ExternalInputResponseSignal,
} from "./flows/types.js";

export const inferenceModelNames = [
  "gpt-4",
  "gpt-4-turbo",
  "gpt-3.5-turbo",
  "claude-3-haiku",
  "claude-3-sonnet",
  "claude-3-opus",
] as const;

export type InferenceModelName = (typeof inferenceModelNames)[number];

export const isInferenceModelName = (tbd: string): tbd is InferenceModelName =>
  inferenceModelNames.includes(tbd as InferenceModelName);

type BaseProposedEntitySchemaOrData = {
  entityId: unknown;
  updateEntityId?: unknown;
  /**
   * The AI Model does not reliably return an empty properties object if the entity type has no properties.
   */
  properties?: unknown;
};

type EntitySchemaOrDataLinkFields = {
  sourceEntityId: unknown;
  targetEntityId: unknown;
};

export type ProposedEntitySchemaOrData =
  | BaseProposedEntitySchemaOrData
  | (BaseProposedEntitySchemaOrData & EntitySchemaOrDataLinkFields);

type BaseProposedEntity = {
  entityId: number;
  updateEntityId?: string;
  properties?: Record<BaseUrl, Property>;
};

export type ProposedEntityLinkFields = {
  sourceEntityId: number;
  targetEntityId: number;
};

export type ProposedEntity =
  | BaseProposedEntity
  | (BaseProposedEntity & ProposedEntityLinkFields);

export type InferenceTokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

type InferredEntityResultBase = {
  entity?: SerializedEntity | null;
  entityTypeId: VersionedUrl;
  operation: "create" | "update" | "already-exists-as-proposed";
  proposedEntity: ProposedEntity;
  status: "success" | "failure";
};

export type InferredEntityCreationSuccess = InferredEntityResultBase & {
  entity: SerializedEntity;
  operation: "create";
  status: "success";
};

export type InferredEntityCreationFailure = InferredEntityResultBase & {
  entity?: null;
  failureReason: string;
  operation: "create";
  status: "failure";
};

export type InferredEntityMatchesExisting = InferredEntityResultBase & {
  entity: SerializedEntity;
  operation: "already-exists-as-proposed";
  status: "success";
};

export type InferredEntityUpdateSuccess = InferredEntityResultBase & {
  entity: SerializedEntity;
  operation: "update";
  status: "success";
};

export type InferredEntityUpdateFailure = InferredEntityResultBase & {
  entity?: SerializedEntity;
  failureReason: string;
  operation: "update";
  status: "failure";
};

export type InferredEntityChangeResult =
  | InferredEntityCreationSuccess
  | InferredEntityCreationFailure
  | InferredEntityMatchesExisting
  | InferredEntityUpdateSuccess
  | InferredEntityUpdateFailure;

export type InferEntitiesReturn = Status<{
  /** The modifications to the graph as a result of the process, including abandoned attempts */
  results: InferredEntityChangeResult[];
  /** The number of tokens used during the process, by model call, starting from the first */
  usage: InferenceTokenUsage[];
}>;

export type AutomaticInferenceWebsocketRequestMessage = {
  cookie: string;
  type: "automatic-inference-request";
  payload: AutomaticInferenceArguments;
  requestUuid: string;
};

export type ManualInferenceWebsocketRequestMessage = {
  cookie: string;
  type: "manual-inference-request";
  payload: ManualInferenceArguments;
  requestUuid: string;
};

export type CancelInferEntitiesWebsocketRequestMessage = {
  cookie: string;
  flowRunId: string;
  type: "cancel-inference-request";
  requestUuid: string;
};

export type CheckForExternalInputRequestsWebsocketRequestMessage = {
  cookie: string;
  type: "check-for-external-input-requests";
};

export type ExternalInputWebsocketResponseMessage = {
  cookie: string;
  workflowId: string;
  type: "external-input-response";
  payload: DistributiveOmit<ExternalInputResponseSignal, "resolvedBy">;
};

export type InferenceWebsocketClientMessage =
  | AutomaticInferenceWebsocketRequestMessage
  | ManualInferenceWebsocketRequestMessage
  | CancelInferEntitiesWebsocketRequestMessage
  | CheckForExternalInputRequestsWebsocketRequestMessage
  | ExternalInputWebsocketResponseMessage;

export type ExternalInputWebsocketRequestMessage = {
  workflowId: string;
  payload: ExternalInputRequestSignal;
  type: "external-input-request";
};

export type InferenceWebsocketServerMessage =
  ExternalInputWebsocketRequestMessage;

export type CreateEmbeddingsParams = {
  input: string[];
};

export type CreateEmbeddingsReturn = {
  embeddings: number[][];
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
};

export type GetResultsFromCancelledInferenceRequestQuery = QueryDefinition<
  InferEntitiesReturn,
  never,
  "getResultsFromCancelledInference"
>;
