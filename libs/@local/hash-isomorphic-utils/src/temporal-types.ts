import { VersionedUrl } from "@blockprotocol/graph";
import { Subtype } from "@local/advanced-types/subtype";
import { Entity } from "@local/hash-graph-client";
import {
  AccountId,
  BaseUrl,
  EntityPropertyValue,
  OwnedById,
} from "@local/hash-subgraph";
import type { Status } from "@local/status";

export const inferEntitiesUserArgumentKeys = [
  "entityTypeIds",
  "maxTokens",
  "model",
  "ownedById",
  "temperature",
  "textInput",
] as const;

export type InferEntitiesUserArgumentKey =
  (typeof inferEntitiesUserArgumentKeys)[number];

export type InferEntitiesUserArguments = Subtype<
  Record<InferEntitiesUserArgumentKey, unknown>,
  {
    entityTypeIds: VersionedUrl[];
    maxTokens: number | null;
    model: string;
    ownedById: OwnedById;
    temperature: number;
    textInput: string;
  }
>;

export type InferEntitiesCallerParams = {
  authentication: {
    actorId: AccountId;
  };
  userArguments: InferEntitiesUserArguments;
};

export type ProposedEntitySchemaOrData = {
  entityId: unknown;
  updateEntityId?: unknown;
  /**
   * The AI Model does not reliably return an empty properties object if the entity type has no properties.
   */
  properties?: unknown;
} & ({} | { sourceEntityId: unknown; targetEntityId: unknown });

export type ProposedEntity = Subtype<
  ProposedEntitySchemaOrData,
  {
    entityId: number;
    updateEntityId?: string;
    properties?: Record<BaseUrl, EntityPropertyValue>;
  } & (
    | {}
    | {
        sourceEntityId: number;
        targetEntityId: number;
      }
  )
>;

export type InferredEntityCreationSuccess = {
  entity: Entity;
  operation: "create";
  proposedEntity: ProposedEntity;
  result: "success";
};

export type InferredEntityCreationFailure = {
  failureReason: string;
  operation: "create";
  proposedEntity: ProposedEntity;
  result: "failure";
};

export type InferredEntityUpdateSuccess = {
  entity: Entity;
  operation: "update";
  proposedEntity: ProposedEntity;
  result: "success";
};

export type InferredEntityUpdateFailure = {
  entity?: Entity;
  failureReason: string;
  operation: "update";
  proposedEntity: ProposedEntity;
  result: "failure";
};

export type InferredEntityChangeResult =
  | InferredEntityCreationSuccess
  | InferredEntityCreationFailure
  | InferredEntityUpdateSuccess
  | InferredEntityUpdateFailure;

export type InferEntitiesReturn = Status<InferredEntityChangeResult>;
