import { VersionedUrl } from "@blockprotocol/type-system";
import { Subtype } from "@local/advanced-types/subtype";
import { Entity } from "@local/hash-graph-client";
import {
  AccountId,
  EntityPropertiesObject,
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
    maxTokens: number;
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

export type InferEntitiesCreationFailure = {
  entityTypeId: VersionedUrl;
  failureReason: string;
  proposedProperties: EntityPropertiesObject;
};

export type InferEntitiesReturn = Status<Entity | InferEntitiesCreationFailure>;
