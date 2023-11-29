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

type InferredEntityResultBase = {
  entity?: Entity | null;
  entityTypeId: VersionedUrl;
  operation: "create" | "update";
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
  | InferredEntityUpdateSuccess
  | InferredEntityUpdateFailure;

export type InferEntitiesReturn = Status<InferredEntityChangeResult>;
