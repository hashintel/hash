import type { VersionedUrl } from "@blockprotocol/graph";
import type {
  AutomaticInferenceArguments,
  ManualInferenceArguments,
} from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-types";
import type {
  ExternalInputRequestSignal,
  ExternalInputResponseSignal,
} from "@local/hash-isomorphic-utils/flows/types";
import type {
  BaseUrl,
  Entity,
  EntityPropertyValue,
} from "@local/hash-subgraph";
import type { Status } from "@local/status";
import type { QueryDefinition } from "@temporalio/workflow";

export const inferenceModelNames = [
  "gpt-4",
  "gpt-4-turbo",
  "gpt-3.5-turbo",
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
  properties?: Record<BaseUrl, EntityPropertyValue>;
};

export type ProposedEntityLinkFields = {
  sourceEntityId: number | string;
  targetEntityId: number | string;
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
  entity?: Entity | null;
  entityTypeId: VersionedUrl;
  operation: "create" | "update" | "already-exists-as-proposed";
  proposedEntity: ProposedEntity;
  status: "success" | "failure";
};

export type InferredEntityCreationSuccess = InferredEntityResultBase & {
  entity: Entity;
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
  entity: Entity;
  operation: "already-exists-as-proposed";
  status: "success";
};

export type InferredEntityUpdateSuccess = InferredEntityResultBase & {
  entity: Entity;
  operation: "update";
  status: "success";
};

export type InferredEntityUpdateFailure = InferredEntityResultBase & {
  entity?: Entity;
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
  payload: ExternalInputResponseSignal;
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
