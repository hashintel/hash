import type { PropertyObject, VersionedUrl } from "@blockprotocol/type-system";
import type { DistributiveOmit } from "@local/advanced-types/distribute";
import type { SerializedEntity } from "@local/hash-graph-sdk/entity";
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
  properties?: PropertyObject;
};

export type ProposedEntityLinkFields = {
  sourceEntityId: number;
  targetEntityId: number;
};

/**
 * @deprecated only used in an old inference flow – use ProposedEntity from the flows/types.ts file instead
 */
export type DeprecatedProposedEntity =
  | BaseProposedEntity
  | (BaseProposedEntity & ProposedEntityLinkFields);

export type InferenceTokenUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

type InferredEntityResultBase = {
  entity?: SerializedEntity | null;
  entityTypeIds: VersionedUrl[];
  operation: "create" | "update" | "already-exists-as-proposed";
  proposedEntity: DeprecatedProposedEntity;
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

type WebSocketMessageAuth = {
  /**
   * Optional fallback for clients (e.g. browser extensions) that cannot rely on
   * upgrade-request cookies being available on the WebSocket handshake.
   */
  cookie?: string;
};

export type AutomaticInferenceWebsocketRequestMessage = WebSocketMessageAuth & {
  type: "automatic-inference-request";
  payload: AutomaticInferenceArguments;
  requestUuid: string;
};

export type ManualInferenceWebsocketRequestMessage = WebSocketMessageAuth & {
  type: "manual-inference-request";
  payload: ManualInferenceArguments;
  requestUuid: string;
};

export type CancelInferEntitiesWebsocketRequestMessage =
  WebSocketMessageAuth & {
    flowRunId: string;
    type: "cancel-inference-request";
    requestUuid: string;
  };

export type CheckForExternalInputRequestsWebsocketRequestMessage =
  WebSocketMessageAuth & {
    type: "check-for-external-input-requests";
  };

export type ExternalInputWebsocketResponseMessage = WebSocketMessageAuth & {
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

export type GetResultsFromCancelledInferenceRequestQuery = QueryDefinition<
  InferEntitiesReturn,
  never,
  "getResultsFromCancelledInference"
>;
